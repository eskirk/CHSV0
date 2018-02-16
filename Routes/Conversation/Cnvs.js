var Express = require('express');
var Tags = require('../Validator.js').Tags;
var router = Express.Router({caseSensitive: true});
var async = require('async');

router.baseURL = '/Cnvs';

router.get('/', function(req, res) {
   var owner = (req.query.owner || req.query.id) || null;

   if (owner)
      req.cnn.chkQry('select id, title, lastMessage, ownerId from Conversation\
       where ownerId = ?', [owner],
         function(err, cnvs) {
            if (!err)
               res.json(cnvs);
            req.cnn.release();
         });
   else 
      req.cnn.chkQry('select id, title, lastMessage, ownerId from \
       Conversation', null,
         function(err, cnvs) {
            if (!err)
               res.json(cnvs);
            req.cnn.release();
         });
});

router.get('/:id', function(req, res) {
   var cnvId = req.params.id;
   var cnn = req.cnn;
   var vld = req.validator;

   async.waterfall([
      function(cb) {
         if (vld.check(!isNaN(cnvId), Tags.notFound, null, cb))
            cnn.chkQry('select id, title, lastMessage, ownerId from \
             Conversation where id = ?', [cnvId], cb);
      },
      function(existingCnv, fields, cb) {
         if (vld.check(existingCnv.length, Tags.notFound, null, cb)) {
            res.json(existingCnv)
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
         if (vld.check(('title' in body) && body['title'].length > 0, 
              Tags.missingField, ['title'], cb) && 
              vld.check(body['title'].length <= 80, Tags.badValue, ['title'], 
              cb))
            cnn.chkQry('select * from Conversation where title = ?', 
             body.title, cb);
      },
      function(existingCnv, fields, cb) {
         if (vld.check(!existingCnv.length, Tags.dupTitle, null, cb)) {
            body.ownerId = req.session.id;
            cnn.chkQry("insert into Conversation set ?", body, cb);
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
             vld.check(body.title.length, Tags.badValue, ['title'], cb) &&
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
         vld.chkQry('delete from Message where cnvId = ?', [cnvId], cb);
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
    ' join Message m on cnvId = c.id join Person p on prsId = p.id where ' + 
    'c.id = ?';

   // Add a clause for dateTime
   if (req.query.dateTime) {
      query += ' and whenMade <= ?';
      params.push(req.query.dateTime);
   }
   query += ' order by whenMade, id'
   // And finally add a limit clause and parameter if indicated.
   if (req.query.num) {
      query += ' limit ?';
      params.push(req.query.num);
   }

   async.waterfall([
      function(cb) {  // Check for existence of conversation
         cnn.chkQry('select * from Conversation where id = ?', [cnvId], cb);
      },
      function(cnvs, fields, cb) { // Get indicated messages
         if (Number(req.query.num) === 0) {
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
   var cnvId = req.params.cnvId;
   var body = req.body;
   var content = req.body.content;
   var now;

   async.waterfall([
      function(cb) {
         cnn.chkQry('select * from Conversation where id = ?', [cnvId], cb);
      },
      function(cnvs, fields, cb) {
         if (vld.check(cnvs.length, Tags.notFound, null, cb) &&
             vld.check('content' in body, Tags.missingField, ['content'], cb) &&
             vld.check(content.length <= 5000, Tags.badValue, ['content'], cb))
            cnn.chkQry('insert into Message set ?',
            {cnvId: cnvId, prsId: req.session.id,
            whenMade: now = new Date(), content: body.content}, cb);
      },
      function(insRes, fields, cb) {
         cnn.chkQry('update Conversation set lastMessage = ? where id = ?',
         [now, cnvId], cb);
         res.status(200).location('/Msgs/' + insRes.insertId).end();
      }],
      function(err) {   
         cnn.release();
      });
});

module.exports = router;
