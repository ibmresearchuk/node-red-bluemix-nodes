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

module.exports = function(RED) {
  var watson = require('watson-developer-cloud');
  var cfenv = require('cfenv');

  var services = cfenv.getAppEnv().services,
    service;

  var username, password;

  var service = cfenv.getAppEnv().getServiceCreds(/language translation/i)

  if (service) {
    username = service.username;
    password = service.password;
  }
 
  RED.httpAdmin.get('/watson-translate/vcap', function(req, res) {
    res.json(service ? service.credentials.sids : null);
  });

  function SMTNode(config) {
    RED.nodes.createNode(this, config);
    var node = this;

    // TODO: What if user inputs creds manually?
    var sids = service.sids;

    this.on('input', function(msg) {
      if (!msg.payload) {
        node.error('Missing property: msg.payload');
        return;
      }
      var sid = config.language;
      if (config.language === "") {
        var exists = false;

        sids.forEach(function (sid) {
          if (sid.sid === msg.lang) {
            exists = true;
          }
        });

        if (exists) {
          sid = msg.lang;
        } else {
          node.warn("Language passed in on msg.lang is invalid: message not translated");
          node.send(msg);
          return;
        }
      }

      username = username || config.username;
      password = password || config.password;

      if (!username || !password) {
        node.error('Missing Language Translation service credentials');
        return;
      }

      var machine_translation = watson.machine_translation({
        username: username,
        password: password,
        version: 'v1'
      });

      var langs = sid.split("-");

      machine_translation.translate({
        text: msg.payload, from : langs[1], to: langs[2] },
        function (err, response) {
          if (err) { node.error(err); }
          else { msg.payload = response.translation || ""; }
          node.send(msg);
        });

    });
  }
  RED.nodes.registerType("watson-translate",SMTNode);
};
