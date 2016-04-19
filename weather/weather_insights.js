/**
 * Copyright 2015 IBM Corp.
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
    var cfenv = require('cfenv');
    var services = cfenv.getAppEnv().services;
    var username, password, host = 'https://twcservice.mybluemix.net';
    var service = cfenv.getAppEnv().getServiceCreds(/insights for weather/i);

    if (service) {
        username = service.username;
        password = service.password;
        host = 'https://' + service.host;
    }

    RED.httpAdmin.get('/weather_insights/vcap', function(req, res) {
        res.json(service ? {bound_service: true} : null);
    });

    function Node(config) {
        RED.nodes.createNode(this,config);
        var node = this;

        this.on('input', function(msg) {
            username = username || this.credentials.username;
            password = password || this.credentials.password;

            if (!username || !password) {
                var message = 'Missing Weather Insights service credentials';
                node.error(message, msg);
                return;
            }

            var lat_long_regex = /^[-+]?([1-8]?\d(\.\d+)?|90(\.0+)?),\s*[-+]?(180(\.0+)?|((1[0-7]\d)|([1-9]?\d))(\.\d+)?)$/;
            var geocode;

            if (typeof msg.payload === 'string' && msg.payload.match(lat_long_regex)) {
                geocode = msg.payload;
            } else if (typeof msg.location === 'object') {
                geocode = [msg.location.lat, msg.location.lon].join(',');
            } else if (config.geocode.match(lat_long_regex)) {
                geocode = config.geocode;
            } else {
                var message2 = 'Missing valid latlong parameters on either msg.payload, msg.location or node config.';
                node.error(message2, msg);
                return;
            }

            var request = require('request');

            node.status({fill:"blue", shape:"dot", text:"requesting"});
            request({url: host + config.service, auth: {username: username, password: password}, qs: {geocode: geocode, units: config.units, language: config.language}}, function(error, response, body) {
                node.status({});
                if (!error && response.statusCode == 200) {
                    var results = JSON.parse(body);
                    msg.forecasts = results.forecasts;
                    msg.observation = results.observation;
                    msg.observations = results.observations;
                    node.send(msg);
                } else {
                    var message3 = 'Weather Insights service call failed with error HTTP response.';
                    node.error(message3, msg);
                }
            });
        });
    }

    RED.nodes.registerType("weather_insights",Node, {
        credentials: {
            username: {type:"text"},
            password: {type:"password"}
        }
    });
};
