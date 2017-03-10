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
    var username, password, host, base_uri = '/api/weather/v1/geocode/';
    var service;
    for (var i in services) {
        if (i.match(/^(weatherinsights)/i)) {
            service = services[i][0];
        }
    }

    if (service) {
        username = service.credentials.username;
        password = service.credentials.password;
        host = service.credentials.host;
    }

    RED.httpAdmin.get('/weather_insights/vcap', function(req, res) {
        res.json(service ? {bound_service: true} : null);
    });

    function Node(config) {
        RED.nodes.createNode(this,config);
        var node = this;

        this.on('input', function(msg) {
            var service_username = username || this.credentials.username;
            var service_password = password || this.credentials.password;
            var service_host = host || config.host;
            var language = config.language || msg.language || "en-US";

            if (!service_username || !service_password || !service_host) {
                var message = 'Missing Weather Insights service credentials';
                node.error(message, msg);
                return;
            }

            var lat_long_regex = /^[-+]?([1-8]?\d(\.\d+)?|90(\.0+)?),\s*[-+]?(180(\.0+)?|((1[0-7]\d)|([1-9]?\d))(\.\d+)?)$/;
            var geocode;

            if (typeof msg.payload === 'string' && msg.payload.match(lat_long_regex)) {
                geocode = msg.payload.replace(',', '/');
            } else if (typeof msg.location === 'object') {
                geocode = [msg.location.lat, msg.location.lon].join('/');
            } else if (config.geocode.match(lat_long_regex)) {
                geocode = config.geocode.replace(',', '/');
            } else {
                var message2 = 'Missing valid latlong parameters on either msg.payload, msg.location or node config.';
                node.error(message2, msg);
                return;
            }

            var request = require('request');

            node.status({fill:"blue", shape:"dot", text:"requesting"});
            request({url: 'https://' + service_host + base_uri + geocode + config.service, auth: {username: service_username, password: service_password}, qs: {units: config.units, language: language}}, function(error, response, body) {
                node.status({});

                if (error) {
                  node.error('Weather Insights service call failed with error HTTP response.', msg);
                } else if (response.statusCode === 401) {
                  node.error('Weather Insights service call failure due to authentication failure.', msg);
                } else if (response.statusCode === 404) {
                  node.error('Weather Insights service call failed due to HTTP 404 response to API call.', msg);
                } else if (response.statusCode !== 200) {
                  node.error('Weather Insights service call failed due to non-200 HTTP response to API call.', msg);
                } else {
                    var results = JSON.parse(body);
                    msg.forecasts = results.forecasts;
                    msg.observation = results.observation;
                    msg.observations = results.observations;
                    node.send(msg);
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
