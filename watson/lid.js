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

var http = require('http');
var https = require('https');
var url = require('url');

// parse the VCAP_SERVICES env variable and get the http rest URI
var services = JSON.parse(process.env.VCAP_SERVICES || "{}");
var service = services["txtlidstg"] || "{}";

var RED = require(process.env.NODE_RED_HOME+"/red/red");

RED.httpAdmin.get('/language-id/vcap', function(req,res) {
    res.send(JSON.stringify(service));
});

module.exports = function(RED) {
    function LIDNode(config) {
        RED.nodes.createNode(this,config);
        var node = this;

        if (service === "{}") {
            this.on('input', function(msg) {
                node.error("No language identification service bound");
            });
        } else {
            var cred = service[0]["credentials"];
            var uri = url.parse(cred["uri"]);
            var uid = cred["userid"];
            var passwd = cred["password"];
            var sids = cred["sids"];

            this.on('input', function(msg) {
                // chooses the first lid service bound
                var sid = sids[0]["sid"];
                // var rt = config.rt || "text";

                // prepare HTTP request, input is stored in "msg.payload"
                var rqt = "rt=text&sid=" + encodeURIComponent(sid) +
                "&txt=" + encodeURIComponent(msg.payload);

                var options = {
                    hostname: uri.hostname,
                    port: uri.port,
                    path: uri.path,
                    protocl: uri.protocol,
                    method: 'POST',
                    auth: uid+":"+passwd,
                    headers: {
                        "Connection": "keep-alive",
                        "Content-Type": "application/x-www-form-urlencoded",
                        "Content-Length": rqt.length
                    }
                };

                // issue http request
                var httpclient = (uri.protocol=="https:" ? https : http);
                var client = httpclient.request(options, function(resp) {
                    resp.setEncoding('utf8');
                    var rspbody = "";

                    // we do the following to handle HTTP chunked response
                    resp.on('data', function(chunk) {
                        rspbody += chunk;
                    });

                    resp.on('end', function() {
                        // output is stored in rspbody
                        // msg.payload = rspbody;
                        msg.lang = rspbody;
                        node.send(msg);
                    });
                });

                // handle http error
                client.on('error', function(e) {
                    node.error(e);
                });

                client.write(rqt);
                client.end();
            });
        }
    }
    RED.nodes.registerType("language-id",LIDNode);
}
