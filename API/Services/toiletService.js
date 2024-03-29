const logger = require('../../Common/logger').toiletLogger;
const toiletModel = require('../Models/toiletModel');
const {createResponseObj, createErrorMetaObj} = require('./commonService');
const {toiletDownloadConfig} = require('../../Common/config');
const {geocodeApiRequest_Kakao, geocodeApiRequest_Naver, reverseGeocodeApiRequest_Naver} = require('../../Common/apiRequest');
const excel = require('xlsx');


// Service
module.exports.getSync = async (req, res, next) => {
  const result = await fetchToiletData();

  if (result.totalCount > 0) {
    const response = createResponseObj(result, 'ok', true);

    res.status(200).json(response);
  } else {
    next(result);
  }
}

module.exports.getMapInfo = async (req, res, next) => {
  try {
    const params = req.query;

    // 파라미터가 누락되면 Code 400 반환
    if (!params.location_lat || !params.location_lng || !params.sw_lat || !params.sw_lng || !params.ne_lat || !params.ne_lng) {
      const response = createResponseObj({}, '[10021] Invalid query', false);
      res.status(400).json(response);
      return;
    }

    const toilet = new toiletModel.Toilet();
    const {rows} = await toilet.readByLatLng(params);

    const responseResult = rows
      // 현재 위치와 화장실 위치의 직선 거리 추가
      .map(row => {
        row.distance = Math.sqrt(Math.pow(row.wsg84_x - parseFloat(params.location_lng), 2) + Math.pow(row.wsg84_y - parseFloat(params.location_lat), 2));
        return row;
      })
      // 직선 거리 기준 오름차순으로 정렬
      .sort((a, b) => {
        return a.distance - b.distance;
      })
      // 응답 객체 반환
      .map(row => {
        return {
          id: row.toilet_id,
          category: row.toilet_category_name,
          nameArray: row.toilet_name,
          region: row.toilet_region,
          address: row.toilet_address,
          roadAddress: row.toilet_road_address,
          management: row.management_agency,
          phoneNumber: row.phone_number,
          openTime: row.open_hour,
          lat: row.wsg84_y,
          lng: row.wsg84_x
        }
      });

    const response = createResponseObj(responseResult, 'ok', true);

    res.status(200).json(response);
  } catch (err) {
    logger.error(err.message, createErrorMetaObj(err));
    next(err);
  }
}


const addressValidator = (region, address) => {
  let result = address;
  if (/[0-9]/.test(result)) {
    const replaceAddr = result.replace(',', '').replace(/\(.*\)/g, '').trim();
    const splitAddr = replaceAddr.split(' ').reverse();

    for (const item of splitAddr.slice()) {
      if (/[0-9]/.test(item)) {
        break;
      }
      splitAddr.shift();
    }

    result = splitAddr.reverse().join(' ');
  }

  if (result.split(' ').length <= 2) {
    result = region + ' ' + result;
  }

  return result;
}

// Fetch from url
const fetchToiletData = async () => {
  const toilet = new toiletModel.Toilet();

  let totalToiletCount = 0;
  const totalStartTime = new Date();

  try {
    // Create temp table
    const tempResult = await toilet.createTempTable();

    for (const pair of toiletDownloadConfig) {
      const startTime = new Date();

      // Excel download from url
      const response = await fetch(pair.url);
      const data = await response.arrayBuffer();

      // Excel read from buffer
      const workbook = excel.read(data);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonSheet = excel.utils.sheet_to_json(sheet)
        .map(item => {
          const address = item['소재지지번주소'];
          const roadAddress = item['소재지도로명주소'];

          item['소재지지번주소'] = address ? addressValidator(pair.region, address) : address;
          item['소재지도로명주소'] = roadAddress ? addressValidator(pair.region, roadAddress) : roadAddress;

          return item;
        })
        // 도로명 및 지번 주소로 정렬
        .sort((a, b) => {
          if (a['소재지도로명주소'] > b['소재지도로명주소']) return 1;
          if (b['소재지도로명주소'] > a['소재지도로명주소']) return -1;
          if (a['소재지지번주소'] > b['소재지지번주소']) return 1;
          if (b['소재지지번주소'] > a['소재지지번주소']) return -1;
          return 0;
        });

      // Create insert object
      let insertObjectArray = [];
      const failedAddressArray = [];
      let currentNameArray = [];
      let previousLatLng = '';
      let previousAddress = '';
      let failCount = 0;

      // TODO: 지도 API 요청을 병렬로 처리시, API 서버의 할당량 초과 문제 발생.
      for (const row of jsonSheet) {
        const address_1 = row['소재지지번주소'];
        const address_2 = row['소재지도로명주소'];

        if (!address_1 && !address_2) {
          continue;
        }

        let currentAddress = address_1 || address_2;

        // 직전에 실패한 주소와 현재의 주소가 같으면 넘어간다.
        if (failedAddressArray.at(-1) === address_1 || failedAddressArray.at(-1) === address_2) {
          failCount++;
          continue;
        }
        // 직전에 성공한 주소와 현재의 주소가 같을 경우 이름만 추가
        if (previousAddress === currentAddress) {
          // 같은 주소의 화장실 이름이 중복되지 않을 경우만 이름 추가
          if (!currentNameArray.includes(row['화장실명'])) {
            currentNameArray.push(row['화장실명']);
            insertObjectArray.at(-1).name += `, "${row['화장실명']}"`;
          }
          continue;
        }

        previousAddress = currentAddress;

        // 네이버맵에 시도 후, 실패하면 카카오맵에 시도
        let result = await geocodeApiRequest_Naver(currentAddress);
        result = result ? result : await geocodeApiRequest_Kakao(currentAddress);

        // 지번주소가 실패하면 도로명주소로 다시 시도
        if (!result && address_2 && currentAddress === address_1) {
          currentAddress = address_2;
          result = await geocodeApiRequest_Naver(currentAddress);
          result = result ? result : await geocodeApiRequest_Kakao(currentAddress);
        }

        // 모두 실패하면 넘어간다.
        if (!result) {
          failedAddressArray.push(currentAddress);
          previousAddress = '';
          failCount++;
          continue;
        }

        // X/Y 좌표가 같은 화장실은 이름만 추가
        if (previousLatLng === result.x + '|' + result.y) {
          currentNameArray.push(row['화장실명']);
          insertObjectArray.at(-1).name += `, "${row['화장실명']}"`;
          continue;
        }

        // 지번이나 도로명 주소 중, 하나라도 Null이면 Reverse Geocode API 요청
        if (!result.address || !result.roadAddress) {
          const addressResult = await reverseGeocodeApiRequest_Naver(result.x, result.y);
          if (addressResult) {
            result.address = addressResult.address;
            result.roadAddress = addressResult.roadAddress;
          }
        }

        previousLatLng = result.x + '|' + result.y;
        currentNameArray = [row['화장실명']] ;

        const categoryStr = row['구분'];
        let category = 4;
        if (categoryStr.includes('공중')) {
          category = 1;
        } else if (categoryStr.includes('개방')) {
          category = 2;
        } else if (categoryStr.includes('간이')) {
          category = 3;
        }

        insertObjectArray.push({
          category: category,
          name: `"${row['화장실명']}"`,
          region: pair.region,
          address: result.address || null,
          road_address: result.roadAddress || null,
          management: row['관리기관명'] || null,
          phoneNum: row['전화번호'] || null,
          openHour: row['개방시간'] || null,
          x: result.x,
          y: result.y
        });
      }

      const sortedInsertObjectArray = [];
      insertObjectArray = insertObjectArray
        .sort((a, b) => {
          if (a.address > b.address) return 1;
          if (b.address > a.address) return -1;
          if (a.road_address > b.road_address) return 1;
          if (b.road_address > a.road_address) return -1;
          return 0;
        });
      // 주소가 중복될 경우 이름만 추가
      insertObjectArray.forEach(item => {
        const address_1 = item.address || '';
        const address_2 = sortedInsertObjectArray.at(-1)?.address || '';
        const roadAddress_1 = item.road_address || '';
        const roadAddress_2 = sortedInsertObjectArray.at(-1)?.road_address || '';
        if (address_1 === address_2 && roadAddress_1 === roadAddress_2) {
          sortedInsertObjectArray.at(-1).name += `, ${item.name}`;
        } else {
          sortedInsertObjectArray.push(item);
        }
      });

      // Insert to tempDB
      const insertResult = await toilet.insertToTemp(sortedInsertObjectArray);

      totalToiletCount += sortedInsertObjectArray.length;

      const endTime = new Date();

      const infoLogObject = {
        region: pair.region,
        targetCount: jsonSheet.length,
        succeedCount: sortedInsertObjectArray.length,
        failedCount: failCount,
        failedAddressArray: failedAddressArray,
        duration: `${endTime - startTime} ms`
      }

      logger.info(`[${toiletDownloadConfig.indexOf(pair) + 1}/${toiletDownloadConfig.length}] Toilet data loading...`, {result: infoLogObject});
    }

    // Disable trigger
    const disableResult = await toilet.disableTrigger();
    // Truncate table
    const truncateResult = disableResult ? await toilet.truncateTable() : false;
    // Copy to table from temp table
    const copyResult = truncateResult ? await toilet.copyTable() : false;
    // Sync manual table
    const updateResult = copyResult ? await toilet.updateToManual() : false;

    const totalEndTime = new Date();

    const result = {
      totalCount: totalToiletCount,
      totalDuration: `${totalEndTime - totalStartTime} ms`
    }

    logger.info('Toilet data loaded', {result: result});

    return result;
  } catch (err) {
    logger.error(err.message, createErrorMetaObj(err));

    return err;
  } finally {
    // Enable trigger
    await toilet.enableTrigger();
    // Drop temp table
    await toilet.dropTempTable();
  }
}
module.exports.fetchToiletData = fetchToiletData;
