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

const LOAD_BALANCER_IP = "130.245.171.38"

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
// app.use(session({
//     secret: 'FbtEs4x32MEBN1EAaMpcDVpbAyGPpq',
//     resave: false,
//     saveUninitialized: false
// }));




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
    db.any("SELECT * FROM USERS where username=$1 or email=$2;", [username, email])
        .then(function (new_data) {
            if(new_data == null || new_data.length == 0) {
                console.log("user " + username + " does not exist. returning and adding user");
                
                var random_num = Math.random()*Date.now() | 0;
                var salty = crypto.createHash('md5').update(random_num.toString()).digest('hex');
                var passwd = crypto.createHash('md5').update(password + salty).digest('hex');
                
                random_num = (Math.random()*Date.now() | 0).toString();
                var val_key = crypto.createHash('md5').update(random_num).digest('hex');
                console.log(util.format("INSERT INTO USERS (username,password,email,salt) VALUES (%s,%s,%s,%s)", username,passwd,email,salty));

                console.log(LOAD_BALANCER_IP + util.format('/email?to=%s&text=%s', encodeURIComponent(email), encodeURIComponent(val_key)));

                db.none("INSERT INTO USERS (username,password,email,salt) VALUES ($1,$2,$3,$4)", [username,passwd,email,salty])
                    .then(function() {
                        console.log("added new user :D");
                        res.json({status: "OK"});
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
                            uri: 'http://' + LOAD_BALANCER_IP + util.format('/email?to=%s&text=%s', encodeURIComponent(email), encodeURIComponent(val_key)),
                            method : "GET",
                            followRedirect: true
                        }, function(err) {
                            if(err){
                                return res.json({status: "error", error: "connection errors"});
                                console.log("err in sending email");
                                console.log(err);
                            }
                        });
                    }) .catch(function (err) {
                        console.log("uh something went wrong when doing add user");
                        console.log(err);
                    });

            } else {
                return res.json({status: "error", error: "User exists"});
            }
        }) .catch(function (err) {
            console.log("ERRR :(", err);
            return res.json({status: "error", error: "error on db function"});
        });

});


/** login starts **/

app.post('/login', function (req, res) {
    console.log("doing login");
    var user_session = req.cookies;
    console.log(user_session);
    user_id = user_session['userID'] == '' ? null : user_session['userID'];
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
                console.log("S:DFJDSLKJ",new_data);
                var salt = new_data["salt"];
                var secret_pass = new_data["password"];
                var passwd = crypto.createHash('md5').update(password + salt).digest('hex');
                console.log(passwd);
                console.log(secret_pass)
                if(passwd == secret_pass) {
                    // set session
                    console.log("hello????")
                    // user_session.userID = username;
                    // req.session.userID = username;
                    res.cookie('userID', username);
                    
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
    res.clearCookie('userID');
    console.log(req.cookies);
    return res.json({status: 'OK'});
    // req.session.destroy(function(err) {
    //     if(err) {
    //         console.log("error happened when destroying session cookie");
    //         console.log(err);
    //     }
    //     return res.json({status: 'OK'});
    // });
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

    db.one("SELECT username FROM users where email=$1 and validated is False", [email])
        .then(function (new_data) {
            if(new_data == null || new_data.length == 0) {
                return res.json({status: "error", error: "Invalid verify inputs"});
            }
            console.log("inside select username on verify");
            console.log(new_data);
            username = new_data.username;
            db.any("SELECT username FROM validate where username=$1 and validkey=$2", [username, key])
                .then(function (new_data) {
                    if(new_data == null || new_data.length == 0) {
                        console.log("invalid key");
                        return res.json({status: "error", error: "Invalid key given"});
                    }
                    res.json({status: "OK"});
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
    var user_session = req.cookies;
    if(user_session == null) {
        return res.json({status: "error", error: "User is not logged in"});
    }
    var data = req.body;
    if (data == null) {
        return res.json({status: "error", error: "No data was sent on res.body"});
    }
    console.log(data);
    console.log(user_session);
    var user_cookie = user_session['userID'] == '' ? null : user_session['userID'];
    if(user_cookie == null) {
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
    

    e_client.index({
        index: INDEX_NAME,
        type: DOC_TYPE,
        id:postid,
        body: {
            id:postid,
            content:content,
            childType:childType,
            parent:parent,
            username:user_cookie
        }
    }, function (err, res) {
        if (err) {
            console.log("inserting went wrong");
            console.log("hello");
            console.log(err);
        }else{
            console.log("INSERTED YEEEEEE");
        }
       // e_client.close();
         // e_client.indices.close({index: INDEX_NAME})
    });

    try {
        res.json({status: "OK", id: postid});
        if (parent != null) {
            //query = "INSERT INTO posts(username, postid, content, child_type, parent_id) VALUES ($1, $2, $3, $4, $5);"

            db.task(function(){
                db.none("INSERT INTO posts(username, postid, content, child_type, parent_id) VALUES ($1, $2, $3, $4, $5);",[user_cookie, postid, content, childType, parent])
                .then(function (b) {
                //   res.status(200)
                //     .json({
                //       status: 'success',
                //       message: 'yeee'
                //     });
                // })
                    console.log("ADDED NEW ITEM TO WITH PARENT ELE");



                    db.none("UPDATE posts set retweet_cnt = retweet_cnt+1 where postid=$1;", [parent])
                    .then(function () {
                        console.log("ADDED NEW ITEM TO WITH PARENT ELE");
                    }).catch(function (err) {
                        console.log("ERRR :(", err);

                        //return next(err);
                    });

             })
            .catch(function (err) {
                console.log("ERRR :(",err);

                //return next(err);
            });
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
        console.log(e);
        return;
        // return res.send(JSON.stringify({"status": "error", "error": "DB connection problem."}));
    }


});



/** get item **/

app.get("/item/:id", function(req, res) {
    
    var id = req.param('id');

    console.log("doing get item for == " + id);

    var user_session = req.cookies;
    var username = user_session['userID'] == '' ? null : user_session['userID'];

    if(username == null) {
        return res.json({status: "error", error: "User is not logged in"});
    }

    db.any("SELECT posts.username, posts.postid, date, content, child_type, parent_id, retweet_cnt, numliked, user_media.mediaid FROM posts FULL OUTER JOIN user_media ON posts.postid = user_media.postid WHERE posts.postid = $1", [id])
        .then (function (new_data) {
            if(new_data == null || new_data.length == 0) {
                return res.json({status: "error", error: "item not found"});
            }
            var media = [];
            // for (var i = 0; i < new_data.length; i++) {
                if(new_data[0]["media"] != null) {
                    media.push(new_data[0]["media"]);
                }
            // }
            console.log(new_data);
            console.log("++++++++++")
            console.log(new_data[0]['date']);
            console.log(Date.parse(new_data[0]['date'].toString()));
            console.log("++++++++++++===");
            new_data = new_data[0];
            item = {'id':new_data['id'], 
                    'username':new_data['username'], 
                    'property':
                        {
                            'likes':new_data['likes']
                        }, 
                    'retweeted': new_data['retweet_cnt'],
                    'content': new_data['content'],
                    'timestamp': new_data['date'] == null?  Date.now() : Date.parse(new_data['date'].toString()), 
                    'childType':new_data['child_type'],
                    'parent':new_data['parent_id'], 
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

    var user_session = req.cookies;
    var user_cookie = user_session['userID'] == '' ? null : user_session['userID'];

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
            timestamp = data.timestamp;
        }
        timestamp = new Date(timestamp * 1000);
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
                var rank_order = "sum DESC";
                if (data.rank != null) {
                    if(data.rank == "time") {
                        rank_order = "posts.date DESC";
                    } else if (data.rank = "interest") {
                        rank_order = "sum DESC";
                    } else {
                        res.json({status:"error", error:"invalid Rank type passed in"});
                    }
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

                query = util.format(query , miniquery) + joinquery + where_query + order_query;
                console.log("SEARCH QUERY IS THIS ====>>>>> ", query);
                new_query = fix_string_formatting(query, q_data);
                console.log("new_query is ============= ", new_query);

                db.any(new_query, q_data)
                    .then(function (new_data) {
                        if (new_data.length == 0) {
                            return res.json({status: "OK", items: []});
                            console.log(" === SEARCH TOOK " + (Date.now() - starting_time));
                        }
                        console.log(new_data);
                        var items = new_data;
                        ret_items = [];
                        i = items[0];
                        console.log(items);
                        for(var x = 0; x < items.length && i[x] == null; x++) {
                        // while (items.length > 0 && i[1] == null) {
                            // items.slice(1);
                            i = items[x];
                            console.log("i am in this loopyyy");
                        }
                        console.log('i is ===>>> ');
                        console.log(i);
                        // console.log(i.date);
                        // console.log(i[2]);
                        d = {'id':i.postid, 
                            'username':i.username, 
                            'property':
                                {
                                    'likes':i.numliked
                                }, 
                            'retweeted':i.retweet_cnt,
                            'content':i.content,
                            'timestamp': Date.parse(i.date.toString()), 
                            'childType':i.child_type,
                            'parent':i.parent_id
                        };
                        console.log(items);
                        current = d.id;
                        console.log(d);
                        console.log(current);
                        media = [];

                        for(var x = 0; x < items.length; x++) {
                            console.log("i am here now in this forloop");
                            if (items[x] == null || items[x] != current) {
                                console.log("meaw asdad");
                                d['meida'] = media;
                                ret_items.push(d);

                                if (items[x] != null) {
                                    console.log("meawe");
                                    i = items[x];
                                    media = [];
                                    if (i.mediaid != null) {
                                        // chnging media
                                        media.push(i.mediaid);
                                    }
                                    d = {'id':i.postid, 
                                        'username':i.username, 
                                        'property':
                                            {
                                                'likes':i.numliked
                                            }, 
                                        'retweeted':i.retweet_cnt,
                                        'content':i.content,
                                        'timestamp': Date.parse(i.date.toString()), 
                                        'childType':i.child_type,
                                        'parent':i.parent_id
                                    };
                                    console.log("\n\nnew d\n\n");
                                    console.log(d);
                                    current = i.postid;

                                }
                                
                            } else {
                                if (items[x][1] == null) {
                                    continue;
                                }
                                if (items[x][8] == null) {
                                    media.push(items[x][8]);
                                }
                            }
                        }
                        res.json({status:"OK", items:ret_items});
                        console.log(" === SEARCH TOOK " + (Date.now() - starting_time));
                    }) .catch (function (err) {
                        console.log("something went wrong at try catch");
                        console.log(err);
                        res.json({status: 'error', error: "Something went wrong at connection"});
                    });
            });

        } else {
            var rank_order = "sum DESC";
            if (data.rank != null) {
                if(data.rank == "time") {
                    rank_order = "posts.date DESC";
                } else if (data.rank = "interest") {
                    rank_order = "sum DESC";
                } else {
                    res.json({status:"error", error:"invalid Rank type passed in"});
                }
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

            query = util.format(query , miniquery) + joinquery + where_query + order_query;
            console.log("SEARCH QUERY IS THIS ====>>>>> ", query);
            new_query = fix_string_formatting(query, q_data);
            console.log("new_query is ============= ", new_query);

            db.any(new_query, q_data)
                .then(function (new_data) {
                    if (new_data.length == 0) {
                        return res.json({status: "OK", items: []});
                        console.log(" === SEARCH TOOK " + (Date.now() - starting_time));
                    }
                    console.log(new_data);
                    var items = new_data;
                    ret_items = [];
                    i = items[0];
                    console.log(items);
                    for(var x = 0; x < items.length && i[x] == null; x++) {
                    // while (items.length > 0 && i[1] == null) {
                        // items.slice(1);
                        i = items[x];
                        console.log("i am in this loopyyy");
                    }
                    console.log('i is ===>>> ');
                    console.log(i);
                    // console.log(i.date);
                    // console.log(i[2]);
                    d = {'id':i.postid, 
                        'username':i.username, 
                        'property':
                            {
                                'likes':i.numliked
                            }, 
                        'retweeted':i.retweet_cnt,
                        'content':i.content,
                        'timestamp': Date.parse(i.date.toString()), 
                        'childType':i.child_type,
                        'parent':i.parent_id
                    };
                    console.log(items);
                    current = d.id;
                    console.log(d);
                    console.log(current);
                    media = [];

                    for(var x = 0; x < items.length; x++) {
                        console.log("i am here now in this forloop");
                        if (items[x] == null || items[x] != current) {
                            console.log("meaw asdad");
                            d['meida'] = media;
                            ret_items.push(d);

                            if (items[x] != null) {
                                console.log("meawe");
                                i = items[x];
                                media = [];
                                if (i.mediaid != null) {
                                    // chnging media
                                    media.push(i.mediaid);
                                }
                                d = {'id':i.postid, 
                                    'username':i.username, 
                                    'property':
                                        {
                                            'likes':i.numliked
                                        }, 
                                    'retweeted':i.retweet_cnt,
                                    'content':i.content,
                                    'timestamp': Date.parse(i.date.toString()), 
                                    'childType':i.child_type,
                                    'parent':i.parent_id
                                };
                                console.log("\n\nnew d\n\n");
                                console.log(d);
                                current = i.postid;

                            }
                            
                        } else {
                            if (items[x][1] == null) {
                                continue;
                            }
                            if (items[x][8] == null) {
                                media.push(items[x][8]);
                            }
                        }
                    }
                    res.json({status:"OK", items:ret_items});
                    console.log(" === SEARCH TOOK " + (Date.now() - starting_time));
                }) .catch (function (err) {
                    console.log("something went wrong at try catch");
                    console.log(err);
                    res.json({status: 'error', error: "Something went wrong at connection"});
                });
            }

    }

    // console.log(" === SEARCH TOOK " + (Date.now() - starting_time));

})


//===============================================================//


app.get("/user/:username", function(req, res) {
    var username = req.params.username;
    if(username == null) {
        return res.json({status: "error", error: "No username specified... boo"});
    }
    ret_user = {'email':null, "followers":0, "following":0}
  
    db.task (function(){
        console.log("LSKDJFLKADJS")
        db.one("SELECT email FROM users where username = $1",[username])
        .then(function (new_data) {
            //console.log("selecting followers of username relation fine")
            if (new_data == null || new_data.length == 0){
                return res.json ({status: "error", error: "User info not found or missing - email"});
            }else{
                ret_user ["email"] = new_data["email"];
                db.one("SELECT COUNT(follows) FROM followers where follows = $1", [username])
                    .then(function (following_data){
                        if (following_data == null || following_data.length == 0){
                            return res.json ({status: "error", error: "User info not found or missing - email"});
                        }
                        ret_user["following"] = following_data["count"]

                        db.one("SELECT COUNT(follows) FROM followers where username = $1", [username])
                            .then(function (followers_data) {
                                if (followers_data == null || followers_data.length == 0){
                                    return res.json ({status: "error", error: "User info not found or missing - follower count"});
                                }
                                console.log(followers_data)
                                ret_user["followers"] = followers_data["count"];
                                console.log(ret_user)
                                return res.json ({status: "error", user: ret_user});

                            })
                            .catch(function (followers_err) {
                                console.log("something went wrong with finding follower counts", followers_err)
                            })
                    })
                    .catch(function(errror){
                        console.log("something went wrong finding following counts",errror);
                    })

            }
            
        })
        .catch(function (error) {
            console.log("error with following", error)
            return res.json({status: "error", error: "getting followers of user failed"});
        });
    });
});



/** Get all users a user is being followed by **/
app.get("/user/:username/followers", function(req, res) {
    var username = req.params.username;
    if(username == null) {
        return res.json({status: "error", error: "No user specified - who we are looking for?"});
    }

    var limit = 50;
    var data = req.query;
    if (data != null){
        if (data.limit != null){
            datalimit = parseInt(data.limit);
            limit = datalimit > 200  || datalimit < 50 ? 50 : datalimit; 
        }
    }
    console.log(data, data.limit,limit);

    db.any ("SELECT username FROM followers where follows=$1 LIMIT $2;",[username,limit])
        .then(function (new_data) {
            //console.log("selecting followers of username relation fine")
            console.log(new_data);
            followers = []
            for (var x = 0; x < new_data.length; x++){
                followers.push(new_data[x]["username"]);
            }
            return res.json({status: "OK", users: followers});
        })
        .catch(function (error) {
            console.log("error with following", error)
            return res.json({status: "error", error: "getting followers of user failed"});
        });
});


/** Get all users a user is following **/
app.get("/user/:username/following", function(req, res) {
    var username = req.params.username;
    if(username == null) {
        return res.json({status: "error", error: "No user specified - who we are looking for?"});
    }

    var limit = 50;
    var data = req.query;
    if (data != null){
        if (data.limit != null){
            datalimit = parseInt(data.limit);
            limit = datalimit > 200  || datalimit < 50 ? 50 : datalimit; 
        }
    }

    db.any ("SELECT follows FROM followers where username=$1 LIMIT $2;",[username,limit])
        .then(function (new_data) {
            //console.log("selecting followers of username relation fine")
            console.log(new_data);
            following = []
            for (var x = 0; x < new_data.length; x++){
                following.push(new_data[x]["follows"]);
            }
            return res.json({status: "OK", users: following});
        })
        .catch(function (error) {
            console.log("error with following", error)
            return res.json({status: "error", error: "getting users' following of user failed"});
        });
});


/** Follow a user **/
app.post("/follow", function(req, res) {

    var user_session =  req.cookies;
    username = user_session['userID'] == '' ? null : user_session['userID'];
    console.log(user_session);
    if(username == null) {
        return res.json({status: "error", error: "User is not logged in while trying to Follow"});
    }

    var data = req.body;
    if (data == null){
        return res.json({status: "error", error: "No data was sent for follow endpoint"});

    }
    var user_following = data.username == null ? null:  data.username.trim();
    if (user_following == null){
        return res.json ({status: "error", error: "no username provided - who are you trying to following"});
    }
    // var follow = data.follow == null ? true : data.follow.trim().toLowerCase() == "true";
    var follow = data.follow == null ? true : data.follow;
    if (follow) {

        db.none ("INSERT INTO followers (username, follows) VALUES($1 , $2);",[username,user_following ])
            .then(function (new_data) {
                console.log("inserted following relation fine", new_data)

                return res.json({status: "OK", msg: "Followed successfully"});
                // if(new_data == null || new_data.length == 0) {
                //     return res.json({status: "OK", msg: "Followed successfully"});
                // }
            })
            .catch(function (error) {
                console.log("error with following")
                if(error == null) {
                    return res.json({status: "error", error: "following not inserted"});
                }
            });
    } else{

        db.none ("DELETE FROM followers WHERE username=$1 and follows=$2;", [username,user_following ])
            .then(function (new_data) {
                console.log("deleted following relation fine")
                return res.json({status: "OK", msg: "Unfollowed successfully"});

            })
            .catch(function (error) {
                console.log("error with unfollowing")
                return res.json({status: "error", msg: "Error with unfollowing successfully"});

               
            });
    }
});

/** like an id with the logged in user **/

app.post("/item/:id/like", function(req, res) {

    var id = req.params.id;

    console.log("liking post with id" + id)

    var user_session =  req.cookies;
    username = user_session['userID'] == '' ? null : user_session['userID'];

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
        db.task(function(){
            db.none("INSERT INTO likes (username, postid) VALUES ($1, $2);", [username, id])
            .then (function (){

                db.none("UPDATE posts set numliked = numliked+1 where postid=$1;", [id])
                    .then(function () {
                        return res.json({status:"OK",msg:"Liked and incremented like count in post"})
                    }) .catch(function (err) {
                        console.log("ERRR :( with updating like count", err);
                            return res.json({status:"error",msg:"error happened while updating more likes"})

                    });
                }) 
            .catch (function(err){
                    console.log("error happened while inserting to like table", err);
                    return res.json({status:"error",msg:"error happened while liking"})

            });
        });
    }
    else{
        db.task(function(){
            db.one("DELETE FROM likes where username=$1 and postid=$2 RETURNING *", [username,id])
                .then (function (unlike_data){
                    if (unlike_data == null || Object.keys(unlike_data).length == 0){
                        return res.json({status:"error",msg:"did not unlike a like that didnt exist"})
                    }

                    db.none("UPDATE posts set numliked = numliked-1 where postid=$1;", [id])
                        .then(function () {
                            return res.json({status:"OK",msg:"Unliked and decremented like count in post"})
                        }) .catch(function (err) {
                            console.log("Error happened while unliking to updating like table",err);
                            return res.json({status:"error",msg:"error happened while updating less likes"})
                    });

                }) .catch (function(err){
                    console.log("error happened while unliking to updating like table",err);
                    return res.json({status:"error",msg:"error happened while unliking"})

                });
            });

    }

});



//============== HELPER FUNCTIONS =============================================//


function fix_string_formatting(string, variables) {
    console.log("inside fix_string");
    list = string.split('%s');
    console.log(list);
    new_str = list[0];
    for (var i = 1; i < list.length; i++) {
        new_str += (' $' + i + ' ' + list[i]);
        console.log('\n'+i+'\n' + new_str + '\n');
    }
    
    return new_str;
 }


//============== SETTING UP NON-API ENDPOINTS FOR SANITY=============================================//

app.get('/', function (req, res) {
    res.send('Welcome to Instanode');
})


app.listen(8000, function () {
    console.log('API Application started on port 8000')
})


