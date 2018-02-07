var Express = require('express');
var Tags = require('../Validator.js').Tags;
var ssnUtil = require('../Session.js');
var async = require('async');
var router = Express.Router({caseSensitive: true});

router.baseURL = '/Ssns';

router.get('/', function(req, res) {
   var body = [], ssn;

   if (req.validator.checkAdmin()) {
      for (var cookie in ssnUtil.sessions) {
         ssn = ssnUtil.sessions[cookie];
         body.push({cookie: cookie, prsId: ssn.id, loginTime: ssn.loginTime});
      }
      res.status(200).json(body);
   }
});

router.post('/', function(req, res) {
   var cookie;
   var cnn = req.cnn;
   var body = req.body;
   var vld = req.validator;

   async.waterfall([
      function(cb) {
         if (vld.hasFields(body, ["email", "password"], cb)) {
            cnn.chkQry('select * from Person where email = ?', [body.email], cb);
         }
      },
      function(existingPrss, fields, cb) {
         if (vld.check(existingPrss.length && existingPrss[0].password === body.password, 
         Tags.badLogin, null, cb)) {
            cookie = ssnUtil.makeSession(existingPrss[0], res);
            res.location(router.baseURL + '/' + cookie).status(200).end()
         }
      }],
      function(err) {
         cnn.release();
      });
});

router.delete('/:cookie', function(req, res) {
   if (req.validator.check(req.params.cookie === req.cookies[ssnUtil.cookieName],
    Tags.noPermission)) {
      ssnUtil.deleteSession(req.params.cookie);
      res.status(200).end();
   }
   req.cnn.release();
});

router.get('/cookie', function(req, res) {
   var cookie = req.params.cookie;
   var vld = req.validator;

   if (vld.checkPrsOK(ssnUtil.sessions[cookie].id)) {
      res.json({prsId: req.session.id});
   }
   req.cnn.release();
});

module.exports = router;
