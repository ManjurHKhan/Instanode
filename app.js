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
var util = require('util');

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
app.use(session({
    secret: 'FbtEs4x32MEBN1EAaMpcDVpbAyGPpq',
    resave: true,
    saveUninitialized: true
}));
var user_session;




/** sign up start **/

app.post('/adduser', function(req, res) {
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

});


/** login starts **/

app.post('/login', function (req, res) {
    console.log("doing login");
    user_session = req.session;
    user_id = user_session.userID;
    console.log(user_id,user_id != null )
    if(user_id == null) {
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
        // validate loging
        db.one("SELECT salt, password FROM USERS where username=$1 and validated is True", [username])
            .then(function (new_data) {
                if(new_data == null) {
                    return res.json({status: 'error', error: 'User does not exists'});
                }
                var salt = new_data[0];
                var secret_pass = new_data[1];
                var passwd = crypto.createHash('md5').update(password + salt).digest('hex');
                if(passwd == secret_pass) {
                    // set session
                    console.log("hello????")
                    user_session.userID = username;
                    return res.json({status: 'OK'});
                } else {
                    return res.json({status: 'error', error: 'Password does not match'});
                }
            }) .catch(function (err) {
                console.log("Error happened while doing login");
                console.log(err);
                return res.json({status: 'error', error: 'Connection error happened'});
            });

            // }) .catch (function (err) {
            //     res.json({status: 'error', error: 'Connection error happened'});
            // });
    }else{
        // assuming that if userid is set up then the user is correct
        console.log("userid == false")
        return res.json({status: 'OK'});
    }
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

    var user_session = req.session;
    var username = user_session.userID;

    if(username == null) {
        return res.json({status: "error", error: "User is not logged in"});
    }

    db.any("SELECT posts.username, posts.postid, date, content, child_type, parent_id, retweet_cnt, numliked, user_media.mediaid FROM posts FULL OUTER JOIN user_media ON posts.postid = user_media.postid WHERE posts.postid = $1", [id])
        .then (function (new_data) {
            if(new_data == null || new_data.length == 0) {
                return res.json({status: "error", error: "item not found"});
            }
            var media = [];
            for (var i = 0; i < new_data.length; i++) {
                if(new_data[i][8] != null) {
                    media.push(new_data[i][8]);
                }
            }
            var i = new_data[0];
            item = {'id':i[1], 
                    'username':i[0], 
                    'property':
                        {
                            'likes':i[7]
                        }, 
                    'retweeted':i[6],
                    'content':i[3],
                    'timestamp': Date.parse(str(i[2]).split('.')[0]), 
                    'childType':i[4],
                    'parent':i[5], 
                    'media':media
                }

            return res.json({status:"OK", item : item});

        }) .catch (function (err) {
            console.log("error happeend while fetching item");
            console.log(err);
            return res.json({status: "error", error: "connection error while getting post by id"});
        });
});


/** search item **/

app.post("/search", function(req, res) {

    console.log("in search");
    var starting_time = Date.now();

    var user_session = req.session;
    var user_cookie = user_session.userID;

    if(user_cookie == null) {
        return res.json({status: "error", error: "User is not logged in"});
    }

    var data = req.body;

    if(data != null) {
        console.log(data);

        q_data = [];

        dic = {
            "interest": {  "time" : {"order" : "asc"} },
            "rank": {  "sume(likes+ retweets) " : {"order" : "asc"} },
            "parent" :  "match" ,
            "hasMedia" : "true",
        };

        var limit = 25;
        if (data.limit != null) {
            limit = data.limit > 0 ? data.limit < 101 ? data.limit : 25 : 25;
        }
        timestamp = Math.floor(Date.now() / 1000);
        if (data.timestamp != null) {
            timestamp = date.timestamp;
        }
        timestamp = new Date(timestamp);
        timestamp = timestamp.toISOString();
        console.log("timestamp = " + timestamp);

        var username = null;
        var q_string = null;
        var following = true;
        q_data.push(timestamp);

        query = "SELECT posts.username, posts.postid, date, content, child_type, parent_id, retweet_cnt, numliked, user_media.mediaid FROM (%s) as posts "
                    
        joinquery = "%s user_media on posts.postid = user_media.postid "
        secretjoin = "FULL OUTER JOIN"
        miniquery = "SELECT username, postid, date, content, child_type, parent_id, retweet_cnt, numliked, COALESCE(posts.retweet_cnt) + COALESCE(posts.numliked) as sum from posts "

        var hasMedia = false;
        
        if (data.hasMedia != null) {
            hasMedia = data.hasMedia;
            if(hasMedia) {
                joinquery = util.format(joinquery, "INNER JOIN");
                secretjoin = "INNER JOIN";
                miniquery = util.format("SELECT DISTINCT(posts.*), COALESCE(posts.retweet_cnt) + COALESCE(posts.numliked) as sum FROM posts %s user_media on posts.postid = user_media.postid " , secretjoin);
            } else {
                joinquery = util.format(joinquery, "FULL OUTER JOIN");
            }
        } else {
            joinquery = util.format(joinquery, "FULL OUTER JOIN");
        }

        console.log("miniquery");

        miniquery += "WHERE date <= %s ";
        
        if (data.username != null) {
            var username = data.username;
            miniquery += "AND posts.username = %s";
            q_data.push(username);
        }
        var following = true;
        if (data.following != null) {
            following = data.following;
        }
        var where_query = "";
        var hit_ids = [];
        if (data.q != null) {
            es_body = {
                        "query": {
                            "bool": {
                                "must": [
                                {  "match": { "content": "%s"%(data["q"].replace("\n",""))} }
                                // #,
                                // # { "range": { "timestamp":  {
                                // #             "gte" : timestamp,
                                // #             }
                                // #             } KWdeemglJxiHVrV
                                // #             }
                                ] 

                                // # }
                               }
                            }
                        }

            // need to run the elastic search now lol
            e_client.search({
                index: INDEX_NAME,
                doc_type: 'posts',
                body: es_body
            }, function (err, response, status) {
                if(err) {
                    console.log("SEARCH ERROR " + err);
                } else {
                    console.log("-----response hit ------");
                    console.log(response);
                    response.hits.hits.forEach(function(hit) {
                        hit_ids.push("'" + hit._id +"'");
                        console.log(hits);
                    });
                }
                if (hit_ids.length > 0) {
                    str_hirts = '(' + hit_ids.toString() + ')';
                    miniquery += " AND  posts.postid in " + str_hits + " ";
                } else {
                    miniquery += " AND posts.content LIKE %s ";
                    q_data.push("%" + data.q + "%");
                }
            });

        }
        var rank_order = "";
        if (data.rank != null) {
            if(data.rank == "time") {
                rank_order = "posts.date DESC";
            } else if (data.rank = "interest") {
                rank_order = "sum DESC";
            } else {
                res.json({status:"error", error:"invalid Rank type passed in"});
            }
        } else {
            rank_order = "sum DESC";
        }

        if (data.parent != null) {
            var parent = data.parent;
            miniquery += "AND parent_id = %s ";
            q_data.push(parent);
        }
        if (data.replies != null) {
            if (data.replies == false) {
                miniquery += "AND (child_type != %s  OR child_type is NULL) ";
                q_data.push("reply");
            }
        }

        if(data.following != null) {
            miniquery += "AND posts.username IN (SELECT followers.follows FROM followers WHERE followers.username = %s)  ";
            q_data.push(user_cookie);
        }

        order_query = "ORDER BY " + rank_order  + ", posts.postid";
        miniquery += order_query;
        miniquery += " LIMIT %s";
        q_data.push(limit)
        console.log("Q_DATA IS ");
        console.log(q_data);

        query = util.format(query , (miniquery + joinquery + where_query+ order_query));
        console.log("SEARCH QUERY IS THIS ====>>>>> ", query);
        new_query = fix_string_formatting(query, q_data);
        console.log("new_query is ============= ", new_query);

        db.any(query, q_data)
            .then(function (new_data) {
                if (new_data.length == 0) {
                    return res.json({status: "OK", items: []});
                }
                ret_items = [];
                i = items[0];
                while (items.length > 0 && i[1] == null) {
                    items.slice(1);
                    i = items[0];
                }
                d = {'id':i[1], 
                    'username':i[0], 
                    'property':
                        {
                            'likes':i[7]
                        }, 
                    'retweeted':i[6],
                    'content':i[3],
                    'timestamp': Date.parse(str(i[2]).split('.')[0]), 
                    'childType':i[4],
                    'parent':i[5]
                };

                current = d['id'];
                media = [];

                for(var i = 0; i < items.length; i++) {
                    if (items[i] == null || items[i] != current) {
                        d['meida'] = media;
                        ret_items.push(d);
                    }
                    if (items[i] != null) {
                        media = [];
                        if (i[8] != null) {
                            d = {'id':i[1], 
                                'username':i[0], 
                                'property':
                                    {
                                        'likes':i[7]
                                    }, 
                                'retweeted':i[6],
                                'content':i[3],
                                'timestamp': Date.parse(str(i[2]).split('.')[0]), 
                                'childType':i[4],
                                'parent':i[5]
                            };
                            current = i[1];

                        }
                    } else {
                        if (items[i][1] == null) {
                            continue;
                        }
                        if (items[i][8] == null) {
                            media.push(items[i][8]);
                        }
                    }
                }
                res.json({status:"OK", items:ret_items});
            }) .catch (function (err) {
                console.log("something went wrong at try catch");
                console.log(err);
                res.json({status: 'error', error: "Something went wrong at connection"});
            });

    }

    console.log(" === SEARCH TOOK " + (Date.now() - starting_time));

})


//===============================================================//


app.get("/user/<username>", function(req, res) {
    var user_session = req.session;
    var username = user_session.userID;

    if(username == null) {
        return res.json({status: "error", error: "No user logged in... boo"});
    }
    ret_user = {'email':None, followers:0, following:0}
  
    db.task ("SELECT email FROM users where username = $1",[username])
        .then(function (new_data) {
            //console.log("selecting followers of username relation fine")
            if (new_data == null || new_data.length == 0){
                return res.json ({status: "error", error: "User info not found or missing - email"});
            }else{
                ret_user ["email"] = new_data[0];
                db.any("SELECT COUNT(follows) FROM users where follows = $1", [username])
                    .then(function (following_data){
                        if (following_data == null || following_data.length == 0){
                            return res.json ({status: "error", error: "User info not found or missing - email"});
                        }
                        ret_user[following] = following_data[0]

                        db.any("SELECT COUNT(follows) FROM users where username = $1", [username])
                            .then(function (followers_data) {
                                if (followers_data == null || followers_data.length == 0){
                                    return res.json ({status: "error", error: "User info not found or missing - follower count"});
                                }
                                ret_user[followers] = followers_data[0];
                            })
                            .catch(function (followers_err) {
                                console.log("something went wrong with finding follower counts", followers_err)
                            })
                    }
                    .catch(function(errror){
                        console.log("something went wrong finding following counts",errror);
                    }))

            }
            
        })
        .catch(function (error) {
            console.log("error with following", error)
            if(error == null || new_data.length == 0) {
                return res.json({status: "error", error: "getting followers of user failed"});
            }
        });
});



/** Get all users a user is being followed by **/
app.get("/user/<username>/following", function(req, res) {
    var username = req.param.username;
    if(username == null) {
        return res.json({status: "error", error: "No user specified - who we are looking for?"});
    }

    var limit = 50;
    var data = req.body;
    if (data != null){
        limit = data.limit == null || data.limit > 200  || data.limit > 50 ? 50 : data.limit; 
    }
    var user_following = data.user == null ? null:  data.username.trim();
    if (user_following == null){
        return res.json ({status: "error", error: "no username provided - who are you trying to following"});
    }

    db.any ("SELECT username FROM followers where follows=$1 LIMIT $2;",[username,limit])
        .then(function (new_data) {
            //console.log("selecting followers of username relation fine")
            followers = []
            for (var x = 0; x < new_data.length; x++){
                for (var row = 0; row < new_data[x].length; row++){
                    followers.push(new_data[row][x]);
                }
            }
            return res.json({status: "OK", users: followers});
        })
        .catch(function (error) {
            console.log("error with following", error)
            if(error == null || new_data.length == 0) {
                return res.json({status: "error", error: "getting followers of user failed"});
            }
        });
});


/** Get all users a user is following **/
app.get("/user/<username>/following", function(req, res) {
    var username = req.param.username;
    if(username == null) {
        return res.json({status: "error", error: "No user specified - who we are looking for?"});
    }

    var limit = 50;
    var data = req.body;
    if (data != null){
        limit = data.limit == null || data.limit > 200  || data.limit > 50 ? 50 : data.limit; 
    }
    var user_following = data.user == null ? null:  data.username.trim();
    if (user_following == null){
        return res.json ({status: "error", error: "no username provided - who are you trying to following"});
    }


    db.any ("SELECT follows FROM followers where username=$1 LIMIT $2;",[username,limit])
        .then(function (new_data) {
            //console.log("selecting follows ;) relation fine")
            followings = []
            for (var x = 0; x < new_data.length; x++){
                for (var row = 0; row < new_data[x].length; row++){
                    followings.push(new_data[row][x]);
                }
            }
            return res.json({status: "OK", users: followings});
        })
        .catch(function (error) {
            console.log("error with following", error)
            if(error == null || new_data.length == 0) {
                return res.json({status: "error", error: "getting following failed not found"});
            }
    });
});


/** Follow a user **/
app.post("/follow", function(req, res) {

    var user_session =  req.session;
    username = user_session.userID;
    console.log(user_session);
    if(username == null) {
        return res.json({status: "error", error: "User is not logged in while trying to Follow"});
    }

    var data = req.body;
    if (data == null){
        return res.json({status: "error", error: "No data was sent for follow endpoint"});

    }
    var user_following = data.user == null ? null:  data.username.trim();
    if (user_following == null){
        return res.json ({status: "error", error: "no username provided - who are you trying to following"});
    }
    var follow = data.follow == null ? true : data.follow.trim().toLowerCase() == "true";
    if (follow) {

        db.none ("INSERT INTO followers (username, follows) VALUES($1 , $2);",[username,user_following ])
            .then(function (new_data) {
                console.log("inserted following relation fine")
                if(new_data == null || new_data.length == 0) {
                    return res.json({status: "error", error: "item not found"});
                }
            })
            .catch(function (error) {
                console.log("error with following")
                if(error == null || new_data.length == 0) {
                    return res.json({status: "error", error: "item not found"});
                }
            });
    } else{

        db.none ("DELETE FROM followers WHERE username=$1 and follows=$2;", [username,user_following ])
            .then(function (new_data) {
                console.log("deleted following relation fine")
            })
            .catch(function (error) {
                console.log("error with unfollowing")
               
            });
    }
});

/** like an id with the logged in user **/

app.post("/item/:id/like", function(req, res) {

    var id = req.param('id');

    console.log("liking post with id" + id)

    var user_session =  req.session;
    username = user_session.userID;

    if(username == null) {
        return res.json({status: "error", error: "User is not logged in while trying to like"});
    }

    var data = req.body;
    if (data == null) {
        return res.json({status: "error", error: "No data was sent for like endpoint"});
    }
    var like_data = data.like;
    var like = true;
    console.log(like_data);
    like = data.like == null ? true : data.like.trim().toLowerCase() == "true";
    query = ""
    if (like) {
        db.task("INSERT INTO likes (username, postid) VALUES (%s , %s);")
            .then (function (){

                db.none("UPDATE posts set numliked = numliked+1 where postid=$1);", [id])
                    .then(function () {
                        return res.json({status:"OK",msg:"Liked and incremented like count in post"})
                    }) .catch(function (err) {
                        console.log("ERRR :( with updating like count", err);
                    });
                }) 
        .catch (function(err){
                console.log("error happened while inserting to like table", err);
        });
    }
    else{
        db.task("DELETE FROM likes where username=%s and postid=$1 RETURNING *")
            .then (function (){

                db.none("UPDATE posts set numliked = numliked-1 where postid=$1);", [id])
                    .then(function () {
                        return res.json({status:"OK",msg:"Unliked and decremented like count in post"})
                    }) .catch(function (err) {
                        console.log("Error happened while unliking to updating like table",err);
                });

            }) .catch (function(err){
                console.log("error happened while unliking to updating like table",err);
            });

    }

});



//============== HELPER FUNCTIONS =============================================//


function fix_string_formatting(string, variables) {
    list = string.split('%s');
    new_str = list[0];
    for (var i = 1; i < variables.length - 1; i++) {
        new_str += (' #' + i + ' ' + list[i]);
    }
    return new_str;
 }


//============== SETTING UP NON-API ENDPOINTS FOR SANITY=============================================//

app.get('/', function (req, res) {
    res.send('Hello File upload is only a click away. jk');
})


app.listen(8000, function () {
    console.log('API Application started on port 8000')
})


