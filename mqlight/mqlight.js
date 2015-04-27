/**
 * Copyright 2013,2014 IBM Corp.
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
"use strict";

    var cfenv = require("cfenv");
    var appEnv = cfenv.getAppEnv();

    var services = appEnv.services.mqlight || [];
    var serviceList = services.map(function(s) { return s.name; });

    RED.httpAdmin.get('/mqlight/vcap', function(req, res) {
        res.json(serviceList);
    });

    var mqlight = require('mqlight');

    function MQLightIn(n) {
        RED.nodes.createNode(this, n);
        this.service = n.service || "";
        this.topic = n.topic || "";
        this.share = n.share || null;

        var node = this;

        if (node.service === "") {
            node.error("No MQ Light services bound");
        } else {
            if (node.topic === "") {
                node.warn("No topic set in MQ Light in node");
                return;
            }

            var serv = services.filter(function(s) {
                return s.name === node.service;
            })[0];

            var cred = serv.credentials;
            var opts = {
                service: cred.connectionLookupURI,
                user: cred.username,
                password: cred.password
            };

            var recvClient = mqlight.createClient(opts, function(err) {
                if (err) {
                    node.error('Connection to ' + opts.service + ' using client-id ' + recvClient.id + ' failed: ' + err);
                } else {
                    recvClient.on('message', function(data, delivery) {
                        var msg = {
                            topic: delivery.message.topic,
                            payload: data,
                            _session: {
                                type: "mqlight",
                                id: recvClient.id
                            }
                        };
                        if (delivery.destination.share) {
                            msg.share = delivery.destination.share;
                        }
                        node.send(msg);
                    });
                    recvClient.on("error", function(err) {
                        if (err) {
                            node.error(err.toString());
                        }
                    });
                    node.log("Subscribing to "+node.topic+(node.share ? " ["+node.share+"]" : ""));
                    var subscribeCallback = function(err) {
                        if (err) {
                            node.error("Failed to subscribe: " + err);
                        } else {
                            node.log("Subscribed to "+node.topic+(node.share ? " ["+node.share+"]" : ""));
                        }
                    };

                    if (node.share) {
                        recvClient.subscribe(node.topic, node.share,subscribeCallback);
                    } else {
                        recvClient.subscribe(node.topic,subscribeCallback);
                    }
                }
            });
            node.on("close", function (done) {
                recvClient.stop(done);
            });
        }
    }
    RED.nodes.registerType("mqlight in", MQLightIn);

    function MQLightOut(n) {
        RED.nodes.createNode(this, n);
        this.service = n.service || "";
        this.topic = n.topic || "";
        var node = this;

        if (node.service === "") {
            node.error("No MQ Light services bound");
        } else {
            var serv = services.filter(function(s) {
                return s.name === node.service;
            })[0];

            var cred = serv.credentials;
            var opts = {
                service: cred.connectionLookupURI,
                user: cred.username,
                password: cred.password
            };

            var sendClient = mqlight.createClient(opts, function(err) {
                if (err) {
                    node.error('Connection to ' + opts.service + ' using client-id ' + sendClient.id + ' failed: ' + err);
                } else {
                    node.on("input", function(msg) {
                        var topic = node.topic;
                        if (topic === "") {
                            if (msg.topic) {
                                topic = msg.topic;
                            } else {
                                node.warn("No topic set in MQ Light out node");
                                return;
                            }
                        }
                        sendClient.send(topic, msg.payload, function(err) {
                            if (err) {
                                node.error(err, msg);
                            }
                        });
                    });
                }
            });

            sendClient.on("error", function(err) {
                if (err) {
                    node.error(err.toString());
                }
            });

            node.on("close", function (done) {
                sendClient.stop(done);
            });
        }
    }
    RED.nodes.registerType("mqlight out", MQLightOut);
}
