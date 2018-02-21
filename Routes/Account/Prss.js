var Express = require('express');
var Tags = require('../Validator.js').Tags;
var router = Express.Router({ caseSensitive: true });
var async = require('async');
var mysql = require('mysql');

router.baseURL = '/Prss';

// get Prss/{email=<email>}
router.get('/', function (req, res) {
   var email = req.query.email;
   var cnn = req.cnn;
   var vld = req.vld;

   // if an email was specified and the user is an admin
   if (email && req.session.isAdmin()) {
      cnn.chkQry('select id, email from Person where left(email, ' +
         'length(?)) = ?', [email, email], function (err, result) {
            if (err) {
               cnn.destroy();
               res.status(500).json('Failed query');
            }
            else {
               res.status(200).json(result);
               cnn.release();
            }
         });
   }
   // if the email was specified and the user is not an admin
   else if (email && !req.session.isAdmin()) {
      if (req.session.email.toLowerCase().indexOf(email.toLowerCase()) != -1) {
         cnn.chkQry('select id, email from Person where email = ?',
            [req.session.email], function (err, result) {
               if (err) {
                  cnn.destroy();
                  res.status(500).json('Failed query');
               }
               else {
                  res.status(200).json(result);
                  cnn.release();
               }
            });
      }
      else {
         res.status(200).json([]);
         cnn.release();
      }
   }
   // if there was no email specified and the user is an admin
   else if (req.session.isAdmin()) {
      cnn.chkQry('select id, email from Person', null, function (err, result) {
         if (err) {
            cnn.destroy();
            res.status(500).json('Failed query');
         }
         else {
            res.status(200).json(result);
            cnn.release();
         }
      });
   }
   // if there was no email specified and the user is not an admin
   else {
      cnn.chkQry('select id, email from Person where email = ?',
         [req.session.email], function (err, result) {
            if (err) {
               cnn.destroy();
               res.status(500).json('Failed query');
            }
            else {
               res.status(200).json(result);
               cnn.release();
            }
         });
   }
});

// get Prss/id
router.get('/:id', function (req, res) {
   var vld = req.validator;
   var cnn = req.cnn;

   async.waterfall([
      function (cb) {
         if (vld.checkPrsOK(req.params.id, cb))
            cnn.chkQry('select * from Person where id = ?', req.params.id, cb);
      },
      function (prsArr, fields, cb) {
         if (vld.check(prsArr.length, Tags.notFound, null, cb)) {
            delete prsArr[0].password;
            res.json(prsArr);
            cb();
         }
      }],
      function (err) {
         cnn.release();
      });
});

// waterfall implementation of post
router.post('/', function (req, res) {
   var vld = req.validator;  // Shorthands
   var body = req.body;
   var admin = req.session && req.session.isAdmin();
   var cnn = req.cnn;

   if (admin && !body.password)
      body.password = "*";                       // Blocking password
   body.whenRegistered = new Date().valueOf();

   async.waterfall([
      function (cb) {
         if ((vld.hasFields(body, ["email", "lastName", "password", "role"], 
             cb) ||
            (vld.hasFields(body, ["email", "lastName", "role"], cb) && 
             admin)) &&
            vld.chain(body.role === 0 || admin, Tags.noPermission)
               .chain(body.termsAccepted || admin, Tags.noTerms)
               .chain(body.password || admin, Tags.missingField, ["password"])
               .check(body.role >= 0, Tags.badValue, ["role"], cb)) {
            cnn.chkQry('select * from Person where email = ?', body.email, cb);
         }
      },
      function (existingPrss, fields, cb) {
         if (vld.check(!existingPrss.length, Tags.dupEmail, null, cb)) {
            var now = new Date().valueOf();
            body.termsAccepted = body.termsAccepted && now;
            cnn.chkQry('insert into Person set ?', body, cb);
         }
      },
      function (result, fields, cb) { // Return location of inserted Person
         res.location(router.baseURL + '/' + result.insertId).end();
         cb();
      }],
      function (err) {
         cnn.release();
      });
});

// waterfall implementation of put
router.put('/:id', function (req, res) {
   var vld = req.validator;
   var body = req.body;
   var admin = req.session.isAdmin();
   var cnn = req.cnn;
   var id = req.params.id

   if ("id" in body)
      delete body.id;

   async.waterfall([
      function(cb) {
         if (vld.checkPrsOK(id, cb) && Object.keys(body).length === 0) {
            res.status(200).end();
            cnn.release();
         }
         else if (vld.checkPrsOK(id, cb) && Object.keys(body).length &&
            vld.chain(!("whenRegistered" in body), Tags.forbiddenField, 
             ['whenRegistered'])
            .chain(!("termsAccepted" in body), Tags.forbiddenField, 
             ['termsAccepted'])
            .chain(!("email" in body), Tags.forbiddenField, ["email"])
            .chain(!("password" in body) || body.password, Tags.badValue, 
             ['password'])
            .chain(!("role" in body) || admin, Tags.badValue, ['role'])
            .hasExtraFields(body, Object.keys(body), cb) &&
            vld.check(!("password" in body) || ("oldPassword" in body) || admin, 
             Tags.noOldPwd, null, cb))
            cnn.chkQry('select * from Person where id = ?', [id], cb);
      },
      function (prss, fields, cb) {
         if (vld.check(prss.length, Tags.notFound, null, cb) &&
            vld.check(admin || !("password" in body) ||
             body.oldPassword === prss[0].password, Tags.oldPwdMismatch, null,
             cb)) {
            delete body.oldPassword;
            cnn.chkQry('update Person set ? where id = ?', [body, id], cb);
         }
      }],
      function (err) {
         if (!err)
            res.status(200).end();
         cnn.release();
      });
});

router.delete('/:id', function (req, res) {
   var vld = req.validator;
   var cnn = req.cnn;

   async.waterfall([
      function (cb) {
         if (vld.checkAdmin(cb))
            cnn.chkQry('select * from Person where id = ?', [req.params.id],
               cb);
      },
      function (prss, fields, cb) {
         if (vld.check(prss.length, Tags.notFound, null, cb))
            cnn.chkQry('delete from Person where id = ?', [req.params.id], cb);
      },
      function (cnvs, fields, cb) {
         cnn.chkQry('delete from Conversation where ownerId = ?',
            [req.params.id], cb);
      },
      function (cnvs, fields, cb) {
         cnn.chkQry('delete from Message where prsId = ?', [req.params.id], cb);
      }],
      function (err) {
         if (!err)
            res.status(200).end();
         cnn.release();
      });
});

module.exports = router;
