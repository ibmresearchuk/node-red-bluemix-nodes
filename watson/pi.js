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

module.exports = function (RED) {
  var cfenv = require('cfenv');

  var services = cfenv.getAppEnv().services, 
    service;

  if (services.personality_insights) service = services.personality_insights[0];

  RED.httpAdmin.get('/watson-personality-insights/vcap', function (req, res) {
    res.json(service);
  });

  function Node(config) {
    RED.nodes.createNode(this,config);
    var node = this;

    if (!service) {
      node.error("No personality insights service bound");
    } else {
      var cred = service.credentials;
      var username = cred.username;
      var password = cred.password;

      this.on('input', function (msg) {
        if (!msg.payload) {
          node.error('Missing property: msg.payload');
          return;
        }
        if (msg.payload.split(' ').length < 100) {
          node.error('Personality insights requires a minimum of one hundred words.');
          return;
        }
        
        var watson = require('watson-developer-cloud');

        var personality_insights = watson.personality_insights({
          username: username,
          password: password,
          version: 'v2'
        });

        personality_insights.profile({text: msg.payload }, function (err, response) {
          if (err) {
            node.error(err);
          } else{
            msg.insights = response.tree;
          }

          node.send(msg);
        });
      });
    }
  }
  RED.nodes.registerType("watson-personality-insights",Node);
};
