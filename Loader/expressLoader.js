const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const fs = require("fs");


const cspOptions = {
  directives: {
    ...helmet.contentSecurityPolicy.getDefaultDirectives(),
    "script-src": ["'self'", "'sha256-WBVS3n2R2puYCpKTujNn/foCHXCXy/BW1LOLEGrpn0w='", "*.fontawesome.com", "*.naver.com", "*.pstatic.net", "*.googletagmanager.com"],
    "connect-src": ["'self'", "datamoa.kr", "*.fontawesome.com", "*.naver.com", "*.navercorp.com", "*.kakao.com", "*.google-analytics.com"],
    "img-src": ["'self'", "data:", "*.pstatic.net", "*.navercorp.com"]
  }
};

module.exports = async (app) => {
  // CORS
  app.use(cors());

  // Security header
  app.use(helmet({
    contentSecurityPolicy: cspOptions,
    crossOriginEmbedderPolicy: false
  }));

  // Datamoa HTML Response
  app.get('/', (req, res) => {
    const indexHTML = fs.readFileSync(path.join(__dirname, '../API/Views/build/index.html'), {
      encoding: 'utf8'
    });

    const datamoaMeta = fs.readFileSync(path.join(__dirname, '../API/Views/build/meta/datamoa.txt'), {
      encoding: 'utf8'
    });

    const responseHTML = indexHTML.replace('<title></title>', datamoaMeta);

    res.contentType('text/html').status(200).send(responseHTML);
  });

  // Toilet HTML Response
  app.get('/toilet', (req, res) => {
    const indexHTML = fs.readFileSync(path.join(__dirname, '../API/Views/build/index.html'), {
      encoding: 'utf8'
    });

    const toiletMeta = fs.readFileSync(path.join(__dirname, '../API/Views/build/meta/toilet.txt'), {
      encoding: 'utf8'
    });

    const responseHTML = indexHTML.replace('<title></title>', toiletMeta);

    res.contentType('text/html').status(200).send(responseHTML);
  });

  // Toto HTML Response
  app.get('/toto', (req, res) => {
    const indexHTML = fs.readFileSync(path.join(__dirname, '../API/Views/build/index.html'), {
      encoding: 'utf8'
    });

    const totoMeta = fs.readFileSync(path.join(__dirname, '../API/Views/build/meta/toto.txt'), {
      encoding: 'utf8'
    });

    const responseHTML = indexHTML.replace('<title></title>', totoMeta);

    res.contentType('text/html').status(200).send(responseHTML);
  });

  // Cookie parser
  app.use(cookieParser());

  // JSON parser
  app.use(express.json());

  // Static file
  app.use(express.static(path.join(__dirname, '../API/Views/build')));
}
