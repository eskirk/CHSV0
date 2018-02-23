var Express = require('express');
var Tags = require('../Validator.js').Tags;
var router = Express.Router({caseSensitive: true});
var async = require('async');

router.baseURL = '/Cnvs';

router.get('/', function(req, res) {
   var owner = req.query.owner || null;

   if (owner)
      req.cnn.chkQry('select id, title, ownerId, lastMessage from ' +
       'Conversation where ownerId = ?', [owner], function(err, cnvs) {
         if (!err)
            res.status(200).json(cnvs);
            req.cnn.release();
         });
   else 
      req.cnn.chkQry('select id, title, ownerId, lastMessage from ' +
       'Conversation', null, function(err, cnvs) {
            if (!err)
               res.status(200).json(cnvs);  
            req.cnn.release();
         });
});

router.get('/:cnvId', function(req, res) {
   var id = req.params.cnvId;
   var cnn = req.cnn;
   var vld = req.validator;

   async.waterfall([
      function(cb) {
         cnn.chkQry('select id, title, ownerId, lastMessage from ' +
          'Conversation where id = ?', [id], cb);
      },
      function(existingCnv, fields, cb) {
         if (vld.check(existingCnv.length, Tags.notFound, null, cb)) {
            res.json(existingCnv[0])
            cb();
         }
      }],
      function(err) {
         if (!err)
            res.status(200).end();
         cnn.release();
      }
   );
})

router.post('/', function(req, res) {
   var vld = req.validator;
   var body = req.body;
   var cnn = req.cnn;

   async.waterfall([
      function(cb) {
         if (vld.check(body.title && body.title.length > 0, 
          Tags.missingField, ['title'], cb) && 
          vld.check(body['title'].length <= 80, Tags.badValue, ['title'], cb))
            cnn.chkQry('select * from Conversation where title = ?', 
             body.title, cb);
      },
      function(existingCnv, fields, cb) {
         if (vld.check(!existingCnv.length, Tags.dupTitle, null, cb)) {
            body.ownerId = req.session.id;
            cnn.chkQry('insert into Conversation set ?', body, cb);
         }
      },
      function(insRes, fields, cb) {
         res.location(router.baseURL + '/' + insRes.insertId).end();
         cb();
      }],
      function(err) {
         cnn.release();
      });
});

router.put('/:cnvId', function(req, res) {
   var vld = req.validator;
   var body = req.body;
   var cnn = req.cnn;
   var cnvId = req.params.cnvId;

   async.waterfall([
      function(cb) {
         cnn.chkQry('select * from Conversation where id = ?', [cnvId], cb);
      },
      function(cnvs, fields, cb) {
         if (vld.check(cnvs.length, Tags.notFound, null, cb) &&
          vld.check(body.title.length, Tags.missingField, ['title'], cb) &&
          vld.checkPrsOK(cnvs[0].ownerId, cb))
            cnn.chkQry('select * from Conversation where id <> ? && title = ?',
             [cnvId, body.title], cb);
      },
      function(sameTtl, fields, cb) {
         if (vld.check(!sameTtl.length, Tags.dupTitle, null, cb))
            cnn.chkQry("update Conversation set title = ? where id = ?",
             [body.title, cnvId], cb);
      }],
      function(err) {
         if (!err)
            res.status(200).end();
         req.cnn.release();
      });
});

router.delete('/:cnvId', function(req, res) {
   var vld = req.validator;
   var cnvId = req.params.cnvId;
   var cnn = req.cnn;

   async.waterfall([
      function(cb) {
         cnn.chkQry('select * from Conversation where id = ?', [cnvId], cb);
      },
      function(cnvs, fields, cb) {
         if (vld.check(cnvs.length, Tags.notFound, null, cb) &&
          vld.checkPrsOK(cnvs[0].ownerId, cb)) 
            cnn.chkQry('delete from Conversation where id = ?', [cnvId], cb);
      },
      function(cnvs, fields, cb) {
         cnn.chkQry('delete from Message where cnvId = ?', [cnvId], cb);
      }],
      function(err) {
         if (!err)
            res.status(200).end();
         cnn.release();
      });
});

router.get('/:cnvId/Msgs', function(req, res) {
   var vld = req.validator;
   var cnvId = req.params.cnvId;
   var cnn = req.cnn;
   var params = [cnvId];
   var query = 'select m.id, whenMade, email, content from Conversation c' +
    ' join Message m on cnvId = c.id join Person p on prsId = p.id where' +
    ' c.id = ?';

   // Add a clause for dateTime
   if (req.query.dateTime) {
      query += ' and whenMade <= ?';
      params.push(req.query.dateTime);
   }
   query +=  ' order by whenMade, id'
   // And finally add a limit clause and parameter if indicated.
   if (req.query.num) {
      query += ' limit ?';
      params.push(Number(req.query.num));
   }

   async.waterfall([
      function(cb) {  // Check for existence of messages
         cnn.chkQry('select * from Message where cnvId = ?', [cnvId], cb);
      },
      function(cnvs, fields, cb) { // Get indicated messages
         if (Number(req.query.num) === 0 || Number(req.query.dateTime == 0)) {
            res.json([]);
            res.status(200).end();
            cnn.release();
         }
         else if (vld.check(cnvs.length, Tags.notFound, null, cb))
            cnn.chkQry(query, params, cb);
      },
      function(msgs, fields, cb) { // Return retrieved messages
         res.json(msgs);
         cb();
      }],
      function(err){
         cnn.release();
      });
});

router.post('/:cnvId/Msgs', function(req, res){
   var vld = req.validator;
   var cnn = req.cnn;
   var id = req.params.cnvId;
   var body = req.body;
   var content = req.body.content;
   var now = new Date().valueOf();

   async.waterfall([
      function(cb) {
         cnn.chkQry('select * from Conversation where id = ?', [id], cb);
      },
      function(cnvs, fields, cb) {
         if (vld.check(cnvs.length, Tags.notFound, null, cb) &&
          vld.check('content' in body, Tags.missingField, ['content'], cb) &&
          vld.check(content.length <= 5000, Tags.badValue, ['content'], cb))
            cnn.chkQry('insert into Message set ?',
             {cnvId: id, prsId: req.session.id,
             whenMade: now, content: body.content}, cb);
      },
      function(insRes, fields, cb) {
         cnn.chkQry('update Conversation set lastMessage = ? where id = ?',
          [now, id], cb);
         res.status(200).location('/Msgs/' + insRes.insertId).end();
      }],
      function(err) {   
         cnn.release();
      });
});

module.exports = router;
