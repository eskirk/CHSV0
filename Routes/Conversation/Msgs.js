var Express = require('express');
var Tags = require('../Validator.js').Tags;
var router = Express.Router({caseSensitive: true});
var async = require('async');

router.baseURL = '/Msgs';

router.get('/:id', function(req, res) {
   var id = req.params.id
   var cnn = req.cnn;
   var vld = req.validator;

   async.waterfall([
      function(cb) {
         if (vld.check(!isNaN(id), Tags.notFound, null, cb))
            cnn.chkQry('select whenMade, email, content from Message m ' +
             'join Person p on p.id = m.prsId where m.id = ?', 
             [Number(id)], cb);
      },
      function(msg, fields, cb) {
         if (vld.check(msg.length, Tags.notFound, null, cb)) {
            res.json(msg)
            cb();
         }
      }],
      function(err) {
         if (!err)
            res.status(200).end();
         cnn.release();
      }
   );
});

module.exports = router;