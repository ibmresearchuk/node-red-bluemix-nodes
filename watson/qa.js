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

var https = require('https');
var url = require('url');

var services = JSON.parse(process.env.VCAP_SERVICES || "{}");
var service = services["Watson QAAPI-0.1"] || "{}";

var RED = require(process.env.NODE_RED_HOME + "/red/red");

RED.httpAdmin.get('/question/vcap', function(req, res) {
    res.send(JSON.stringify(service));
});

module.exports = function(RED) {
    function QANode(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        if (service === "{}") {
            this.on('input', function(msg) {
                node.error("No question answer service bound");
            });
        } else {
            // retrieve the credential information from VCAP_SERVICES for Watson QAAPI
            var host   = service[0].credentials.url;
            var passwd = service[0].credentials.password;
            var userid = service[0].credentials.userid;

            this.on('input', function(msg) {
                var output = config.output || "";

                // set required headers
                var headers = {
                    'Content-Type'  :'application/json',
                    'X-synctimeout' : '30',
                    'Authorization' : "Basic " + new Buffer(userid+":"+passwd).toString("base64")
                };

                // create the request options to POST our question to Watson
                var parts = url.parse(host);
                var options = {
                    host: parts.hostname,
                    port: 443,
                    path: parts.pathname,
                    method: 'POST',
                    headers: headers,
                    rejectUnauthorized: false, // ignore certificates
                    requestCert: true,
                    agent: false
                };

                // Create a request to POST to Watson
                var req = https.request(options, function(result) {
                    var rspbody = "";

                    result.on("data", function(chunk) {
                        rspbody += chunk;
                    });

                    result.on('end', function() {
                        var json = JSON.parse(rspbody);
                        var answers = json.question.answers;

                        if (answers) {
                            if (output === "top") {
                                msg.payload = answers[0].formattedText.replace(/<(?:.|\n)*?>/gm, '');
                                msg.confidence = answers[0].confidence;
                            } else if (output === "all") {
                                var all = [];

                                answers.forEach(function (answer) {
                                    var unformatted = answer.formattedText.replace(/<(?:.)*?>/gm, " ").replace(/\n/g, " ").replace(/\s{2,}/g, " ");
                                    var ans = {
                                        payload: unformatted,
                                        confidence: answer.confidence
                                    };
                                    all.push(ans);
                                });

                                msg.payload = all;
                            }
                        } else {
                            msg.payload = "";
                        }

                        node.send(msg);
                    });
                });

                req.on('error',function(e) {
                    node.error(e);
                });

                // items returned not working
                var question = {
                    question: {
                        questionText: msg.payload,
                        formattedAnswer: true
                    }
                };

                req.write(JSON.stringify(question));
                req.end();

            });
        }
    }
    RED.nodes.registerType("question",QANode);
}
