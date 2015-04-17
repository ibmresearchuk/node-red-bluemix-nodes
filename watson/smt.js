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

  if (services.machine_translation) service = services.machine_translation[0];

  RED.httpAdmin.get('/watson-translate/vcap', function(req, res) {
    if (service) {
      res.json(service.credentials.sids);
      return;
    } 
    res.json(null);
  });

  function SMTNode(config) {
    RED.nodes.createNode(this, config);
    var node = this;

    if (!service) {
      node.error("No machine translation service bound");
    } else {
      var cred = service.credentials;
      var username = cred.username;
      var password = cred.password;
      var sids = cred.sids;

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

        var machine_translation = watson.machine_translation({
          username: username,
          password: password,
          version: 'v1'
        });

        var langs = sid.split("-");

        machine_translation.translate({
          text: msg.payload, from : langs[1], to: langs[2] },
          function (err, response) {
            if (err)
              node.error(err);
            else 
              msg.payload = response.translation || "";
            node.send(msg);
          });

      });
    }
  }
  RED.nodes.registerType("watson-translate",SMTNode);
};
