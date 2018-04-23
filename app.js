// Using the additem that works.

var promise = require('bluebird');

var options = {
    // Initialization Options
    promiseLib: promise
};

var pgp = require('pg-promise')(options);
var connectionString = "postgres://postgres:" + encodeURIComponent("uB78#2xbut") + "@130.245.171.36:5432/instadata";
var db = pgp(connectionString);




app.post('/additem', function (req, res) {

    console.log("for a post request on /additem");
    logger.debug("for a post reuqest on /additem");
    //var client = new pg.Client(conString);
    // res.end();

    var cookies = req.cookies;
    // console.log(req.cookies);
    // var data = req.body.data;
    var data = req.body;
    console.log(data);
    logger.debug(data);


    // logger.debug("disconnecting.");
    var user_cookie = cookies.userID;
    if(user_cookie == null) {
        console.log("cookies : ", req.cookies);
        return res.send(JSON.stringify({"status": "error", "error": "user is not logged in"}));
    }
    console.log("DEFINING VARS");
    var content = data.content == null ? null : data.content;
    var childType = data.childType == null ? null : data.childType;
    if (childType != null) {
        if (childType != "retweet" && childType != "reply") {
            return res.send(JSON.stringify({status: "error", error: "Child type does not match requeired child type"}));
        }
    }
    if (content == null) {return res.send(JSON.stringify({status: "error", error: "content is null"}));}
    var parent = data.parent == null ? null : data.parent;
    // var postid = data.postid;
    var user_cookie = data.user_cookie;
    if (parent == null && childType != null) {
        return res.send(JSON.stringify({status: "error", error: "You cannot be a child without parent"}));
    }
    console.log("starting to you know do things");
    // Try updating the parents and everyhting. also do the connect.
    postid = crypto.createHash('md5').update(Date.now().toString() + user_cookie).digest('hex')
    try {
    res.send(JSON.stringify({status: "OK", id: postid}));
    if (parent != null) {
        query = "INSERT INTO posts(username, postid, content, child_type, parent_id) VALUES ($1, $2, $3, $4, $5);"

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


    }
    catch (e) {
    // do logging
    console.log(e.stack);
    logger.debug(e.stack);
    return;
    // return res.send(JSON.stringify({"status": "error", "error": "DB connection problem."}));
    }


})
