/**
 * Copyright 2013,2015 IBM Corp.
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

  var username, password;

  var service = cfenv.getAppEnv().getServiceCreds(/language translation/i)

  if (service) {
    username = service.username;
    password = service.password;
  }

  RED.httpAdmin.get('/watson-language-identification/vcap', function (req, res) {
    res.json(service);
  });

  function Node (config) {
    RED.nodes.createNode(this, config);
    var node = this;

    this.on('input', function (msg) {
      if (!msg.payload) {
        node.error('Missing property: msg.payload');
        return;
      }

      username = username || config.username;
      password = password || config.password;

      if (!username || !password) {
        node.error('Missing Question and Answer service credentials');
        return;
      }

      var watson = require('watson-developer-cloud');

      var language_identification = watson.language_identification({
        username: username,
        password: password,
        version: 'v1'
      });

      language_identification.identify({text: msg.payload}, function (err, response) {
        if (err) {
          node.error(err);
        } else {
          msg.lang = response.language;
        }

        node.send(msg);
      });
    });
  }
  RED.nodes.registerType('watson-language-identification',Node);
};
