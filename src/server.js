// Required local packages
var config = require('./config');
var model = require('./model');
var login = require("../login/sdk/server/wetfish-login");

// Required node packages
var fs = require('fs');

// Required packages from npm
var express = require('express');
var session = require('express-session');
var RedisStore = require('connect-redis')(session);
var bodyParser = require('body-parser');
var cookie = require('cookie');
var cookieParser = require('cookie-parser');

// Main application variables
var app = express();
var ssl_options = {};
var server = {};


if(config.ssl_enabled)
{
    ssl_options = {
        key: fs.readFileSync(config.ssl_paths.key),
        cert: fs.readFileSync(config.ssl_paths.cert)
    };
    server = require('https').createServer(ssl_options, app);
}
else
{
    server = require('http').createServer(app);
}

var io = require('socket.io')(server);

server.listen(2333);
console.log("Sync Server Started");

login.init(config.login);

// Connect to redis and MySQL
model.connect(config);

// Use the existing connection for session data
app.use(session({
    store: new RedisStore({client: model.redis}),
    secret: config.session.secret
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.set('views', __dirname + '/views');
app.set('view engine', 'hjs');

app.use(function(req, res, next)
{
    console.log(req.sessionID + " - " + req.method + " - " + req.url)
    next();
});

// Required variables routes need access to
var required = {app: app, model: model, login: login};
var routes = ['index', 'login', 'logout', 'user/view', 'channel/create', 'channel/view'];

routes.map(function(route)
{
    require(__dirname + '/routes/'+route+'.js')(required);
});

app.use(express.static(__dirname + '/static'));

// Socket variables
var stats = {count: 0};
var channels = {};

io.sockets.on('connection', function(socket)
{
    var cookies = cookie.parse(socket.handshake.headers.cookie);
    var decrypted = cookieParser.signedCookies(cookies, config.session.secret);
    var user = {session: decrypted['connect.sid']};

    // Required variables events need access to
    var required = {io: io, socket: socket, user: user, channels: channels, stats: stats, model: model};
    var events = ['channel/join', 'channel/chat', 'channel/video', 'channel/time', 'disconnect'];

    events.map(function(event)
    {
        require(__dirname + '/events/'+event+'.js')(required);
    });
    
    console.log('User connected');
    socket.emit('connected');
    
    stats.count++;
    io.sockets.emit('stats', {users: stats.count, channels: Object.keys(channels).length});
});
