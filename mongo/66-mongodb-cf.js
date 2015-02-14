/**
 * Copyright 2013, 2014 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

module.exports = function(RED) {
    var when = require("when");

    var cfenv = require("cfenv");
    var appEnv = cfenv.getAppEnv();

    var services = [];

    for (var i in appEnv.services) {
        if (i.match(/^(TimeSeriesDatabase|JSONDB|mongodb|mongolab)/i)) {
            services = services.concat(appEnv.services[i].map(function(v) {
                return {name:v.name,label:v.label};
            }));
        }
    }

    function ensureValidSelectorObject(selector) {
        if (selector != null && (typeof selector != 'object' || Buffer.isBuffer(selector))) {
            return {};
        }
        return selector;
    }

    var mongo = require('mongodb');
    var MongoClient = mongo.MongoClient;

    function MongoNode(n) {
        RED.nodes.createNode(this,n);
        this.hostname = n.hostname;
        this.port = n.port;
        this.db = n.db;
        this.name = n.name;
        var credentials = RED.nodes.getCredentials(n.id);
        if (credentials) {
            this.username = credentials.user;
            this.password = credentials.password;
        }

        var url = "mongodb://";
        if (this.username && this.password) {
            url += this.username+":"+this.password+"@";
        }
        url += this.hostname+":"+this.port+"/"+this.db;

        this.url = url;
    }

    RED.nodes.registerType("mongodb",MongoNode);

    RED.httpAdmin.get('/mongodb/vcap', function(req,res) {
        res.send(JSON.stringify(services));
    });


    RED.httpAdmin.get('/mongodb/:id',function(req,res) {
        var credentials = RED.nodes.getCredentials(req.params.id);
        if (credentials) {
            res.send(JSON.stringify({user:credentials.user,hasPassword:(credentials.password&&credentials.password!="")}));
        } else {
            res.send(JSON.stringify({}));
        }
    });

    RED.httpAdmin.delete('/mongodb/:id',function(req,res) {
        RED.nodes.deleteCredentials(req.params.id);
        res.send(200);
    });

    RED.httpAdmin.post('/mongodb/:id',function(req,res) {
        var newCreds = req.body;
        var credentials = RED.nodes.getCredentials(req.params.id)||{};
        if (newCreds.user == null || newCreds.user == "") {
            delete credentials.user;
        } else {
            credentials.user = newCreds.user;
        }
        if (newCreds.password == "") {
            delete credentials.password;
        } else {
            credentials.password = newCreds.password||credentials.password;
        }
        RED.nodes.addCredentials(req.params.id,credentials);
        res.send(200);
    });


    var ConnectionPool = function() {
        var clients = {};

        return {
            get: function(url) {
                if (!clients[url]) {
                    clients[url] = {
                        instances:0,
                        promise: when.promise(function(resolve,reject) {
                            MongoClient.connect(url, {
                                db:{
                                    retryMiliSeconds:1000,
                                    numberOfRetries:3
                                },
                                server:{
                                    poolSize:1,
                                    auto_reconnect:true,
                                    socketOptions:{
                                        socketTimeoutMS:10000,
                                        keepAlive:1
                                    }
                                }
                            },function(err,db) {
                                if (err) {
                                    reject(err);
                                } else {
                                    resolve(db);
                                }
                            });
                        })
                    }
                }
                clients[url].instances++;
                return clients[url].promise;
            },
            close: function(url) {
                if (clients[url]) {
                    clients[url].instances--;
                    if (clients[url].instances == 0) {
                        try {
                            clients[url].close();
                        } catch(err) {
                        }
                        delete clients[url];
                    }
                }
            }

        }

    }();


    function MongoOutNode(n) {
        RED.nodes.createNode(this,n);
        this.collection = n.collection;
        this.mongodb = n.mongodb;
        this.payonly = n.payonly || false;
        this.upsert = n.upsert || false;
        this.multi = n.multi || false;
        this.operation = n.operation;

        if (n.service === "_ext_") {
            var mongoConfig = RED.nodes.getNode(this.mongodb);
            if (mongoConfig) {
                this.url = mongoConfig.url;
            }
        } else if (n.service !== "") {
            var mongoConfig = appEnv.getService(n.service);
            if (mongoConfig) {
                this.url = mongoConfig.credentials.url || mongoConfig.credentials.uri || mongoConfig.credentials.json_url;
            }
        }

        if (this.url) {
            var node = this;
            ConnectionPool.get(this.url).then(function(db) {
                var coll;
                if (node.collection) {
                    coll = db.collection(node.collection);
                }
                node.on("input", function(msg) {
                    if (!node.collection) {
                        if (msg.collection) {
                            coll = db.collection(msg.collection);
                        } else {
                            node.error("No collection defined");
                            return;
                        }
                    }
                    delete msg._topic;
                    delete msg.collection;
                    if (node.operation === "store") {
                        if (node.payonly) {
                            if (typeof msg.payload !== "object") {
                                msg.payload = {"payload":msg.payload};
                            }
                            coll.save(msg.payload, function(err,item){
                                if (err) {
                                    node.error(err);
                                }
                            });
                        } else {
                            coll.save(msg, function(err, item) {
                                if (err) {
                                    node.error(err);
                                }
                            });
                        }
                    } else if (node.operation === "insert") {
                        if (node.payonly) {
                            if (typeof msg.payload !== "object") {
                                msg.payload = {"payload": msg.payload};
                            }
                            coll.insert(msg.payload, function(err,item) {
                                if (err) {
                                    node.error(err);
                                }
                            });
                        } else {
                            coll.insert(msg, function(err, item) {
                                if (err) {
                                    node.error(err);
                                }
                            });
                        }
                    } else if (node.operation === "update") {
                        if (typeof msg.payload !== "object") {
                            msg.payload = {"payload": msg.payload};
                        }
                        var query = msg.query || {};
                        var payload = msg.payload || {};
                        var options = {
                            upsert: node.upsert,
                            multi: node.multi
                        };

                        coll.update(query, payload, options, function(err, item) {
                            if (err) {
                                node.error(err);
                            }
                        });
                    } else if (node.operation === "delete") {
                        coll.remove(msg.payload, function(err, items) {
                            if (err) {
                                node.error(err);
                            }
                        });
                    }
                });
            }).otherwise(function(err) {
                node.error(err);
            });
            this.on("close", function() {
                if (this.url) {
                    ConnectionPool.close(this.url);
                }
            });
        } else {
            this.error("missing mongodb configuration");
        }

    }
    RED.nodes.registerType("mongodb out",MongoOutNode);


    function MongoInNode(n) {
        RED.nodes.createNode(this,n);
        this.collection = n.collection;
        this.mongodb = n.mongodb;
        this.operation = n.operation || "find";

        if (n.service === "_ext_") {
            var mongoConfig = RED.nodes.getNode(this.mongodb);
            if (mongoConfig) {
                this.url = mongoConfig.url;
            }
        } else if (n.service !== "") {
            var mongoConfig = appEnv.getService(n.service);
            if (mongoConfig) {
                this.url = mongoConfig.credentials.url || mongoConfig.credentials.uri || mongoConfig.credentials.json_url;
            }
        }

        if (this.url) {
            var node = this;
            ConnectionPool.get(this.url).then(function(db) {
                var coll;
                if (node.collection) {
                    coll = db.collection(node.collection);
                }
                node.on("input", function(msg) {
                    if (!node.collection) {
                        if (msg.collection) {
                            coll = db.collection(msg.collection);
                        } else {
                            node.error("No collection defined");
                            return;
                        }
                    }
                    if (node.operation === "find") {
                        msg.projection = msg.projection || {};
                        var selector = ensureValidSelectorObject(msg.payload);
                        coll.find(selector, msg.projection).sort(msg.sort).limit(msg.limit).toArray(function(err, items) {
                            if (err) {
                                node.error(err);
                            } else {
                                msg.payload = items;
                                delete msg.projection;
                                delete msg.sort;
                                delete msg.limit;
                                node.send(msg);
                            }
                        });
                    } else if (node.operation === "count") {
                        var selector = ensureValidSelectorObject(msg.payload);
                        coll.count(selector, function(err, count) {
                            if (err) {
                                node.error(err);
                            } else {
                                msg.payload = count;
                                node.send(msg);
                            }
                        });
                    } else if (node.operation === "aggregate") {
                        msg.payload = (Array.isArray(msg.payload)) ? msg.payload : [];
                        coll.aggregate(msg.payload, function(err, result) {
                            if (err) {
                                node.error(err);
                            } else {
                                msg.payload = result;
                                node.send(msg);
                            }
                        });
                    }
                });
            }).otherwise(function(err) {
                node.error(err);
            });
            this.on("close", function() {
                if (this.url) {
                    ConnectionPool.close(this.url);
                }
            });
        } else {
            this.error("missing mongodb configuration");
        }
    }
    RED.nodes.registerType("mongodb in",MongoInNode);
}
