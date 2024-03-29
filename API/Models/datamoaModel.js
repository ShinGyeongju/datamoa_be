const {datamoaDB} = require('../../Loader/postgresLoader');

// Model
module.exports.PageCategory = class PageCategory {
  constructor() {
  }

  readAll() {
    return datamoaDB.query('SELECT\n' +
      '    category.category_id AS category_id, category.category_name AS category_title, array_to_json(array_agg(page.*)) AS page_Array\n' +
      'FROM\n' +
      '    tb_page_category AS category LEFT OUTER JOIN tb_page AS page ON category.category_id = page.category_id\n' +
      'GROUP BY category.category_id\n' +
      'ORDER BY category_id;');
  }
}

module.exports.Page = class Page {
  constructor() {
  }

  readAll() {
    return datamoaDB.query('SELECT\n' +
      '    *\n' +
      'FROM\n' +
      '    tb_page AS page LEFT OUTER JOIN tb_page_category AS category ON page.category_id = category.category_id\n' +
      'ORDER BY\n' +
      '    page_id;');
  }

  readById(pageId) {
    return datamoaDB.query('SELECT\n' +
      '    *\n' +
      'FROM\n' +
      '    tb_page AS page LEFT OUTER JOIN tb_page_category AS category ON page.category_id = category.category_id\n' +
      'WHERE \n' +
      '    page_id = ' + `${pageId};`);
  }
}

module.exports.VocCategory = class VocCategory {
  constructor() {
  }

  readAll() {
    return datamoaDB.query('SELECT * FROM tb_voc_category ORDER BY voc_category_id');
  }
}

module.exports.Voc = class Voc {
  constructor() {
  }

  create(vocObject) {
    return datamoaDB.query(`
      INSERT INTO tb_voc (page_id, voc_category_id, voc_content)
      VALUES (
        (SELECT page_id FROM tb_page WHERE page_url = '${vocObject.pageUrl}'), 
        ${vocObject.vocCategoryId}, 
        '${vocObject.vocContent}') RETURNING *
    `);
  }

  readById(vocId) {
    return datamoaDB.query(`SELECT voc.voc_id, page.page_url, page.page_name, page.page_url, category.voc_category_id, category.voc_category_name, voc.voc_content
        FROM tb_voc AS voc LEFT OUTER JOIN tb_page AS page on page.page_id = voc.page_id LEFT OUTER JOIN tb_voc_category AS category on category.voc_category_id = voc.voc_category_id
        WHERE voc.voc_id = '${vocId}';`);
  }
}