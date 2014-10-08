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
    var http = require('http');
    var https = require('https');
    var url = require('url');
    
    var vcap = JSON.parse(process.env.VCAP_SERVICES || "{}");
    var services = (vcap["language_identification"]||[]).map(function(s) { return s.name; });
    
    RED.httpAdmin.get('/watson-language-identification/vcap', function(req,res) {
        res.json(services);
    });

    function LIDNode(config) {
        RED.nodes.createNode(this,config);
        var node = this;
        
        if (services.length == 0) {
            node.error("No language identification service bound");
        } else {
            var cred = service[0].credentials;
            var host = url.parse(cred.url);
            var username = cred.username;
            var password = cred.password;
            var sids = cred.sids;

            this.on('input', function(msg) {
                // chooses the first lid service bound
                var sid = sids[0].sid;

                // prepare HTTP request, input is stored in "msg.payload"
                var rqt = "rt=text&sid=" + encodeURIComponent(sid) +
                "&txt=" + encodeURIComponent(msg.payload);

                var options = {
                    hostname: host.hostname,
                    port: host.port,
                    path: host.path,
                    protocl: host.protocol,
                    method: 'POST',
                    auth: username+":"+password,
                    headers: {
                        "Connection": "keep-alive",
                        "Content-Type": "application/x-www-form-urlencoded",
                        "Content-Length": rqt.length
                    }
                };

                // issue http request
                var httpclient = (host.protocol=="https:" ? https : http);
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
    RED.nodes.registerType("watson-language-identification",LIDNode);
};
