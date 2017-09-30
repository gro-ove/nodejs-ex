let content = (function (){
  const url = 'http://thesetupmarket.com';

  let gotTime = -1;
  let loading = false;
  let callbacks = [];
  let cache = null;

  function load(){
    if (loading) return;

    console.log('Updating data…');

    function result(error, data){ 
      if (data != null){
        if (data.gzip){
          cache = data;
        } else {
          cache = {
            uncompressed: data,
            gzip: zlib.gzipSync(data)
          };
        }

        gotTime = Date.now();
        console.log('Data loaded');
      } else {
        console.log('Error: ' + error);
      }

      for (var c of callbacks){
        c(error, cache);
      }

      callbacks.length = 0;
      loading = false;
    }

    loading = true;
    http.get({
      host: 'thesetupmarket.com',
      path: '/api/get-setups/Assetto%20Corsa',
      headers: {
        'User-Agent': 'Content Manager Caching Server',
        'X-Comment': 'Sorry for overload! Hopefully, now it will work better',
        'Accept-Encoding' : 'gzip,deflate',
      }
    }, function (res) {
      var chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        var buffer = Buffer.concat(chunks);
        var encoding = res.headers['content-encoding'];
        console.log('Encoding: ' + encoding);

        if (encoding == 'gzip') {
          zlib.gunzip(buffer, function(err, decoded) {
            result(err, {
              gzip: buffer,
              uncompressed: decoded && decoded.toString()
            });
          });
        } else if (encoding == 'deflate') {
          zlib.inflate(buffer, function(err, decoded) {
            result(err, decoded && decoded.toString());
          });
        } else {
          result(null, body);
        }
      });

      res.on('error', e => result(e, null));
    }).on('error', e => result(e, null));
  }

  return {
    get: function (callback){
      var now = Date.now();
      if (now - gotTime > 60 * 60e3 || cache == null){
        callbacks.push(callback);
        load();
      } else {
        callback(null, cache);
      }
    }
  };
})();

//  OpenShift sample Node application
var express = require('express'),
    app     = express(),
    morgan  = require('morgan');
    
Object.assign=require('object-assign')

app.engine('html', require('ejs').renderFile);
app.use(morgan('combined'))

var port = process.env.PORT || process.env.OPENSHIFT_NODEJS_PORT || 8080,
    ip   = process.env.IP   || process.env.OPENSHIFT_NODEJS_IP || '0.0.0.0',
    mongoURL = process.env.OPENSHIFT_MONGODB_DB_URL || process.env.MONGO_URL,
    mongoURLLabel = "";

if (mongoURL == null && process.env.DATABASE_SERVICE_NAME) {
  var mongoServiceName = process.env.DATABASE_SERVICE_NAME.toUpperCase(),
      mongoHost = process.env[mongoServiceName + '_SERVICE_HOST'],
      mongoPort = process.env[mongoServiceName + '_SERVICE_PORT'],
      mongoDatabase = process.env[mongoServiceName + '_DATABASE'],
      mongoPassword = process.env[mongoServiceName + '_PASSWORD']
      mongoUser = process.env[mongoServiceName + '_USER'];

  if (mongoHost && mongoPort && mongoDatabase) {
    mongoURLLabel = mongoURL = 'mongodb://';
    if (mongoUser && mongoPassword) {
      mongoURL += mongoUser + ':' + mongoPassword + '@';
    }
    // Provide UI label that excludes user id and pw
    mongoURLLabel += mongoHost + ':' + mongoPort + '/' + mongoDatabase;
    mongoURL += mongoHost + ':' +  mongoPort + '/' + mongoDatabase;

  }
}
var db = null,
    dbDetails = new Object();

var initDb = function(callback) {
  if (mongoURL == null) return;

  var mongodb = require('mongodb');
  if (mongodb == null) return;

  mongodb.connect(mongoURL, function(err, conn) {
    if (err) {
      callback(err);
      return;
    }

    db = conn;
    dbDetails.databaseName = db.databaseName;
    dbDetails.url = mongoURLLabel;
    dbDetails.type = 'MongoDB';

    console.log('Connected to MongoDB at: %s', mongoURL);
  });
};

app.get('/', function (req, res) {
  // try to initialize the db on every request if it's not already
  // initialized.
  if (!db) {
    initDb(function(err){});
  }
  if (db) {
    var col = db.collection('counts');
    // Create a document with request IP and current time of request
    col.insert({ip: req.ip, date: Date.now()});
    col.count(function(err, count){
      res.render('index.html', { pageCountMessage : count, dbInfo: dbDetails });
    });
  } else {
    res.render('index.html', { pageCountMessage : null});
  }
});

app.get('/setups', function (req, res) {
  res.set('Content-Type', 'application/json');
  res.set('Cache-Control', 'no-cache, no-store');

  content.get((error, data) => {
    if (error){
      res.send(JSON.stringify({ error: error }));
    } else {
      if (/gzip/i.test(req.headers['accept-encoding'] || '')){
        res.set('Content-Encoding', 'gzip');
        res.send(data.gzip);
      } else {
        res.send(data.uncompressed);
      }
    }
  });
});

app.get('/pagecount', function (req, res) {
  // try to initialize the db on every request if it's not already
  // initialized.
  if (!db) {
    initDb(function(err){});
  }
  if (db) {
    db.collection('counts').count(function(err, count ){
      res.send('{ pageCount: ' + count + '}');
    });
  } else {
    res.send('{ pageCount: -1 }');
  }
});

// error handling
app.use(function(err, req, res, next){
  console.error(err.stack);
  res.status(500).send('Something bad happened!');
});

initDb(function(err){
  console.log('Error connecting to Mongo. Message:\n'+err);
});

app.listen(port, ip);
console.log('Server running on http://%s:%s', ip, port);

module.exports = app ;
