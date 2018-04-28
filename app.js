var express = require('express');
var session = require('express-session');
var multer  = require('multer');
var path = require('path');
var crypto = require('crypto');
var cookieParser = require('cookie-parser');
var fs = require('fs');
const pg = require('pg');
var nodemailer = require("nodemailer");
const bodyParser = require('body-parser');
const elasticsearch = require('elasticsearch');
var request = require('request');

const LOAD_BALANCER_IP = "130.245.168.67"

/** elastic search set up **/
const INDEX_NAME = "insta_index"
const DOC_TYPE="posts"

var e_client = new elasticsearch.Client({
  host: '130.245.171.41:9200',
  log: 'trace'
});

/** --------------------- **/

/** PostgreSQL setup **/
//const conString = "postgres://postgres:" + encodeURIComponent("uB78#2xbut") + "@130.245.171.36:5432/instadata";
var promise = require('bluebird');

var options = {
    // Initialization Options
    promiseLib: promise
};

var pgp = require('pg-promise')(options);
var connectionString = "postgres://postgres:" + encodeURIComponent("uB78#2xbut") + "@130.245.171.36:5432/instadata";
var db = pgp(connectionString);

/** --------------------- **/

/** media storage setup **/
var storage = multer.diskStorage({
    destination: function(req, file, callback) {
    callback(null, '/var/www/media/media')
    },
    filename: function(req, file, callback) {
    console.log("new_file")
    console.log(file)
    console.log("new file name")
    console.log(new_filename);
    var temp = file.originalname + '-' + Date.now() + path.extname(file.originalname);
    var new_filename = crypto.createHash('md5').update(temp).digest('hex') + path.extname(file.originalname);
    // console.log(new_filename);
    callback(null, new_filename.toLowerCase());
    }
});

/** --------------------- **/

/** express setup **/
var app = express()
app.use(cookieParser());
app.use(bodyParser.json());
app.use(session({secret: 'FbtEs4x32MEBN1EAaMpcDVpbAyGPpq'}));
var user_session;




/** sign up start **/

app.post('/adduser', function(req, res)) {
    console.log("for a post reuqest on /adduser");

    /** checking if data exists **/
    var data = req.body;
    if (data == null) {
        return res.json({status: "error", error: "No data was sent on res.body"});
    }
    console.log(data);

    /** Defining variables **/
    var username = data.username == null ? null : data.username;
    var email = data.email == null ? null : data.email;
    var password = data.password = null ? null : data.password;

    if (username == null || email == null || password == null) {
        return res.json({status: "error", error: "not valid data"});
    }

    /** check if the user already exists **/
    db.one("SELECT * FROM USERS where username=$1 or email=$2);", [username, email])
        .then(function (new_data) {
            if(new_data == null || new_data.length == 0) {
                console.log("user " + username + " does not exist. returning and adding user");
                res.json({status: "OK"});
                
                var random_num = Math.random()*Date.now() | 0;
                var salty = crypto.createHash('md5').update(random_num.toString()).digest('hex');
                var passwd = crypto.createHash('md5').update(password + salty).digest('hex');
                
                random_num = (Math.random()*Date.now() | 0).string();

                var val_key = crypto.createHash('md5').update(random_num).digest('hex');
                console.log("INSERT INTO USERS (username,password,email,salt) VALUES ({0},{1},{2},{3})".format(username,passwd,email,salty))

                db.none("INSERT INTO USERS (username,password,email,salt) VALUES ($1,$2,$3,$4)", [username,passwd,email,salty])
                    .then(function() {
                        console.log("added new user :D");
                    }) .catch(function (err) {
                        console.log("uh something went wrong when doing add user");
                        console.log(err);
                    });

                db.none("INSERT INTO VALIDATE (username,validkey) VALUES ($1,$2)", [username,val_key])
                    .then(function() {
                        console.log("validation key successfully added");
                    }) .catch(function (err) {
                        console.log("validation key adding got wrong");
                        console.log(err);
                    });

                // send the email
                // TODO figure out what to do with email. I vote for letting the email be handled by storage server
                request({
                    uri: LOAD_BALANCER_IP + '?to={0}&text={1}'.format(encodeURIComponent(email), encodeURIComponent(random_num)),
                    method : "GET",
                    followRedirect: true
                }, function(err) {
                    if(err){
                        console.log("err in sending email");
                        console.log(err);
                    }
                });

            } else {
                return res.json({status: "error", error: "User exists"});
            }
        }) .catch(function (err) {
            console.log("ERRR :(");
            return res.json({status: "error", error: "error on db function"});
        });

}


/** login starts **/

app.post('/login', function (req, res) {
    console.log("doing login");
    user_session = req.session;
    user_id = user_session.userID;
    if(user_id != null) {
        // db.one("SELECT username FROM USERS where username=$1 and validated is True", [user_id])
        //     .then(function (new_data) {
        //         if(new_data == null || new_data.length == 0) {
        //             return res.json({status: 'OK'});
        //         }
        var data = req.body;
        if (data == null) {
            return res.json({status: "error", error: "No data was sent on res.body"});
        }
        var username = data.username == null ? null : data.username;
        var password = data.password = null ? null : data.password;

        if (username == null || password == null) {
            return res.json({status: "error", error: "not valid data"});
        }
        db.one("SELECT salt, password FROM USERS where username=%s and validated is True")
            .then(function (new_data) {
                if(new_data == null) {
                    res.json({status: 'error', error: 'User does not exists'});
                }
                var salt = new_data[0];
                var secret_pass = new_data[1];
                var passwd = crypto.createHash('md5').update(password + salt).digest('hex');
                if(passwd == secret_pass) {
                    // set session
                    user_session.userID = username;
                    res.json({status: 'OK'});
                } else {
                    res.json({status: 'error', error: 'Password does not match'});
                }
            }) .catch(function (err) {
                console.log("Error happened while doing login");
                console.log(err);
                res.json({status: 'error', error: 'Connection error happened'});
            });

            // }) .catch (function (err) {
            //     res.json({status: 'error', error: 'Connection error happened'});
            // });
    }
    // assuming that if userid is set up then the user is correct
    return res.json({status: 'OK'});
});


/** logout start **/

app.post("/logout", function (req, res) {
    console.log("At logout");
    req.session.destroy(function(err) {
        if(err) {
            console.log("error happened when destroying session cookie");
            console.log(err);
        }
        return res.json({status: 'OK'});
    });
});


/** verify **/

app.post("/verify", function(req, res) {
    console.log("starting verify");

    var data = req.body;
    if(data == null) {
        return res.json({status: "error", error: "No data was sent on res.body"});
    }
    console.log(data);

    var key = data.key == null ? null : data.key;
    var email = data.email == null ? null : data.email;

    if(key == null || email == null) {
        return res.json({status: "error", error: "No data was sent on res.body"});
    }

    db.one("SELECT username FROM users where email=$1 and validated is False" [email])
        .then(function (new_data) {
            if(new_data == null || new_data.length == 0) {
                return res.json({status: "error", error: "Invalid verify inputs"});
            }
            username = new_data[0];
            db.one("SELECT username FROM validate where username=$1 and validkey=$2", [username, key])
                .then(function (new_data) {
                    if(new_data == null || new_data.length == 0) {
                        console.log("invalid key");
                        return res.json({status: "error", error: "Invalid key given"});
                    }
                    return res.json({status: "OK"});
                    db.none("UPDATE users set validated=True where username=$1 and validated is False", [username])
                        .then(function (err) {
                            console.log("db update for validating user");
                        }) .catch(function(err) {
                            console.log("something went wrong while validating users");
                            console.log(err);
                        });
                }) .catch(function (err) {
                    console.log("something went wrong while connecting.")
                    console.log(err);
                    return res.json({status: "error", error: "connection error"});
                });
        }) .catch(function (err) {
            console.log(err);
            return res.json({status: "error", error: "connection error"});
        });

});


/** add item start **/

app.post('/additem', function (req, res) {

    console.log("for a post request on /additem");

    /** checking if user is logged in using sessions **/
    user_session = req.session;
    if(user_session == null) {
        return res.json({status: "error", error: "User is not logged in"});
    }
    var data = req.body;
    if (data == null) {
        return res.json({status: "error", error: "No data was sent on res.body"});
    }
    console.log(data);

    var user_id = user_session.userID;
    if(user_id == null) {
        console.log("cookies : ", req.cookies);
        return res.json({status: "error", error: "User is not logged in"});
    }
    

    /** defining variables to be used **/
    console.log("DEFINING VARS");
    var content = data.content == null ? null : data.content;
    var childType = data.childType == null ? null : data.childType;
    if (childType != null) {
        if (childType != "retweet" && childType != "reply") {
            return res.json({status: "error", error: "Child type does not match requeired child type"});
        }
    }
    if (content == null) {return res.json({status: "error", error: "content is null"});}
    var parent = data.parent == null ? null : data.parent;
    // var postid = data.postid;
    // var user_cookie = data.user_cookie;
    if (parent == null && childType != null) {
        return res.json({status: "error", error: "You cannot be a child without parent"});
    }
    console.log("getting the postid for the posts");
    // Try updating the parents and everyhting. also do the connect.
    // getting unique postid
    var time = Date.now();
    var random_num = Math.random()*time | 0;
    var postid = crypto.createHash('md5').update(time.toString() + user_cookie + random_num.toString()).digest('hex');
    
    try {
        res.json({status: "OK", id: postid});
        if (parent != null) {
            //query = "INSERT INTO posts(username, postid, content, child_type, parent_id) VALUES ($1, $2, $3, $4, $5);"

            db.task("INSERT INTO posts(username, postid, content, child_type, parent_id) VALUES ($1, $2, $3, $4, $5);")
            .then(function () {
                //   res.status(200)
                //     .json({
                //       status: 'success',
                //       message: 'yeee'
                //     });
                // })
                console.log("ADDED NEW ITEM TO WITH PARENT ELE");



                db.none("UPDATE posts set retweet_cnt = retweet_cnt+1 where postid=$1);", [parent])
                .then(function () {
                    console.log("ADDED NEW ITEM TO WITH PARENT ELE");
                }) .catch(function (err) {
                    console.log("ERRR :(");

                    //return next(err);
                });

            })
            .catch(function (err) {
                console.log("ERRR :(",err);

                //return next(err);
            });

        } else {


            db.none("INSERT INTO posts(username, postid, content) VALUES ($1, $2, $3);",[user_cookie, postid, content])
            .then(function () {
                console.log("NO PARENT: ADDED NEW ITEM TO WITH PARENT ELE");
            }).catch(function (err) {
                console.log("ERRR :( bno pare", err);
                //return next(err);
            });
        }

        media = data.media;
        if (media != null) {
            for(var i = 0; i < media.length; i++) {
            query = "INSERT INTO user_media (username, postid, mediaid) VALUES ($1, $2, $3);"

            db.none("INSERT INTO user_media(username, postid, mediaid) VALUES ($1, $2, $3);",[user_cookie, postid, media[i]])
                .then(function () {
                // console.log("media done");
                }).catch(function (err) {
                    console.log("ERRR :( bno pare 0 media",err);
                //return next(err);
                });

            }
        }


    } catch (e) {
        // do logging
        console.log(e.stack);
        logger.debug(e.stack);
        return;
        // return res.send(JSON.stringify({"status": "error", "error": "DB connection problem."}));
    }


});



/** get item **/

app.get("/item/:id", function(req, res) {
    
    var id = req.param('id');

    console.log("doing get item for == " + id);

    user_session = req.session;
    username = user_session.userID;

    if(username == null) {
        return res.json({status: "error", error: "User is not logged in"});
    }

    db.any("SELECT posts.username, posts.postid, date, content, child_type, parent_id, retweet_cnt, numliked, user_media.mediaid FROM posts FULL OUTER JOIN user_media ON posts.postid = user_media.postid WHERE posts.postid = $1", [id])
        .then (function (new_data) {
            if(new_data == null || new_data.length == 0) {
                return res.json({status: "error", error: "item not found"});
            }

            

        }) .catch (function (err) {
            console.log("error happeend while fetching item");
        });
})



