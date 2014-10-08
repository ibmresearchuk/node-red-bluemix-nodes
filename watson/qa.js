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
var service = services["question_and_answer"] || "{}";

var RED = require(process.env.NODE_RED_HOME + "/red/red");

RED.httpAdmin.get('/question/vcap', function(req, res) {
    res.send((service === "{}")?"":"question_and_answer");
});

module.exports = function(RED) {
    function QANode(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        if (service === "{}") {
            this.on('input', function(msg) {
                node.error("No question and answer service bound");
            });
        } else {
            var cred = service[0].credentials;
            var host = cred.url;
            var username = cred.username;
            var password = cred.password;

            this.on('input', function(msg) {
                var output = config.output || "top";
                var corpus = config.corpus || "healthcare";

                var headers = {
                    'Content-Type'  :'application/json',
                    'Accept':'application/json',
                    'X-synctimeout' : '30',
                    'Authorization' : "Basic " + new Buffer(username+":"+password).toString("base64")
                };

                var parts = url.parse(host + '/v1/question/' + corpus);
                var options = {
                    host: parts.hostname,
                    port: parts.port,
                    path: parts.pathname,
                    method: 'POST',
                    headers: headers
                };

                var req = https.request(options, function(result) {
                    result.setEncoding('utf-8');
                    var rspbody = "";

                    result.on("data", function(chunk) {
                        rspbody += chunk;
                    });

                    result.on('end', function() {
                        var json = JSON.parse(rspbody);
                        var answers = json[0].question.answers;
                        var evidenceList = json[0].question.evidencelist;

                        if (answers) {
                            if (output === "top") {
                                if (answers[0].pipeline.indexOf("TAO") > -1) {
                                    msg.payload = evidenceList[0].text;
                                } else {
                                    msg.payload = answers[0].text;
                                }
                                msg.confidence = answers[0].confidence;
                            } else if (output === "all") {
                                var all = [];

                                for (var i = 0; i < answers.length; ++i) {
                                    var answerText;
                                    if (answers[i].pipeline.indexOf("TAO") > -1) {
                                        answerText = evidenceList[i].text;
                                    } else {
                                        answerText = answers[i].text;
                                    }
                                    var ans = {
                                        payload: answerText,
                                        confidence: answers[i].confidence
                                    };
                                    all.push(ans);
                                }
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

                var question = {
                    question: {
                        questionText: msg.payload
                    }
                };
                req.write(JSON.stringify(question));
                req.end();
            });
        }
    }
    RED.nodes.registerType("watson-question-answer",QANode);
};
