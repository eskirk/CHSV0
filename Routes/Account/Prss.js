var Express = require('express');
var Tags = require('../Validator.js').Tags;
var router = Express.Router({caseSensitive: true});
var async = require('async');
var mysql = require('mysql');

router.baseURL = '/Prss';


router.get('/', function(req, res) {
   var email = req.session.isAdmin() && req.query.email ||
    !req.session.isAdmin() && req.session.email;
   var cnnConfig = {
      host     : 'localhost',
      user     : 'cstaley',
      password : 'CHSpw',
      database : 'cstaley'
   };

   req.cnn.release();  // Since we're not using that

   var cnn = mysql.createConnection(cnnConfig);

   if (email)
      cnn.query('select id, email from Person where email = ?', [email],
      function(err, result) {
         if (err) {
            cnn.destroy();
            res.status(500).json("Failed query");
         }
         else {
            res.status(200).json(result);
         }
      });
   else
      cnn.query('select id, email from Person',
      function(err, result) {
         if (err) {
            cnn.destroy();
            res.status(500).json("Failed query");
         }
         else {
            res.status(200).json(result);
         }
      });
});

// waterfall implementation of post
router.post('/', function(req, res) {
   var vld = req.validator;  // Shorthands
   var body = req.body;
   var admin = req.session && req.session.isAdmin();
   var cnn = req.cnn;

   if (admin && !body.password)
      body.password = "*";                       // Blocking password
   body.whenRegistered = new Date();

   // takes in two parameters:
   //    - array of callback functions
   //    - another function that is called if any errors occur (consider it a try/catch block)
   async.waterfall([
   // cb is the callback function taking in two parameters
   //    - error
   //    - result
   function(cb) { // Check properties and search for Email duplicates
      // vld.hasFields returns true only if all the fields are there
      // if vld.hasFields returns false, none of the subsequent chain calls are executed - 
      //    the cb parameter gets called and the validator calls cb(this), this is truthy,
      //    and the final callback is executed, releasing the connection
      if (vld.hasFields(body, ["email", "password", "role"], cb) &&
       vld.chain(body.role === 0 || admin, Tags.noPermission)
       .chain(body.termsAccepted || admin, Tags.noTerms)
       .check(body.role >= 0, Tags.badValue, ["role"], cb)) {
         // the result of the cnn.chkQry call is passed into the cb parameter which - in a async.waterfall - 
         // ends up just being the next function in the function array
         // SO cnn.chkQry(query, param, cb) -> function(existingPrss, fields, cb)
         cnn.chkQry('select * from Person where email = ?', body.email, cb);
      }
   },
   function(existingPrss, fields, cb) {  // If no duplicates, insert new Person
      // null needs to be passed or else cb would become the "params" field and we can lose connections
      if (vld.check(!existingPrss.length, Tags.dupEmail, null, cb)) {
         body.termsAccepted = body.termsAccepted && new Date();
         cnn.chkQry('insert into Person set ?', body, cb);
      }
   },
   function(result, fields, cb) { // Return location of inserted Person
      res.location(router.baseURL + '/' + result.insertId).end();
      cb();
      // ^-- why is this guy here?
      // if you don't include that, the final error checking function will never be called
      // not only is the error check function good for error checking, it is also somewhat of
      // a "finally" statement. If you don't call the final callback you would never release
      // the connection
   }],
   // one error handler to rule them all
   function(err) {
      cnn.release();
   });
});

// waterfall implementation of put
router.put('/:id', function(req, res) {
   var vld = req.validator;
   var body = req.body;
   var admin = req.session.isAdmin();
   var cnn = req.cnn;
   var id = req.params.id

   async.waterfall([
   function(cb) {
      if (vd.checkPrsOK(id, cb) && 
         vld.chain(!("termsAccepted" in body), Tags.forbiddenField, ['termsAccepted'])
         .chain(!("whenRegistered" in body), Tags.forbiddenField, ['whenRegistered'])
         .chain(!("password" in body) || body.password, Tags.badValue, ['password'])
         .chain(!("password" in body) || ("oldPassword" in body) || admin, Tags.noOldPwd, ['password'])
         .check(body.role && admin, Tags.badValue, ['role'], cb)) 
            cnn.chkQry('select * from Person where id = ?', id, cb);
   },
   function(prss, fields, cb) {
      if (vld.check(prss.length, Tag.notFound, null, cb) &&
          vld.check(admin || !("password" in body) ||
          body.oldPassword === prs[0].password, Tags.oldPwdMismatch, null, cb)) {
         delete body.oldPassword;
         cnn.chkQry("update Person set ? where id = ?", [body, id], cb);
      }
   }],
   function(err) {
      if (!err)
         res.status(200).end();
      cnn.release();
   });
});

// waterfall implementation of get
router.get('/:id', function(req, res) {
   var vld = req.validator;
   var cnn = req.cnn;

   async.waterfall([
      function(cb) {
         if (vld.checkPrsOK(req.params.id, cb)) 
            cnn.chkQry('select * from Person where id = ?', [req.params.id], cb);
      },
      function(prsArr, fields, cb) {
         if (vld.check(prsArr.length, Tags.notFound, null, cb))
            res.json(prsArr);
            cb();
      }],
      function(err) {
         cnn.release();
      });
});

router.delete('/:id', function(req, res) {
   var vld = req.validator;

   if (vld.checkAdmin())
      req.cnn.query('DELETE from Person where id = ?', [req.params.id],
      function (err, result) {
         if (!err || vld.check(result.affectedRows, Tags.notFound))
            res.status(200).end();
         req.cnn.release();
      });
   else {
      req.cnn.release();
   }
});

module.exports = router;
