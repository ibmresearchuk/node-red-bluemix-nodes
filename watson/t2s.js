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

  var services = cfenv.getAppEnv().services, 
    service;

  if (services.text_to_speech) service = services.text_to_speech[0];

  RED.httpAdmin.get('/watson-text-to-speech/vcap', function(req, res) {
    res.json(service);
  });

  function Node(config) {
    RED.nodes.createNode(this, config);
    var node = this;

    if (!service) {
      node.error("No text to speech service bound");
    } else {
      var cred = service.credentials;
      var username = cred.username;
      var password = cred.password;

      var toArray = require('stream-to-array')

      this.on('input', function(msg) {
        if (!msg.payload) {
          node.error('Missing property: msg.payload');
          return;
        }
        var watson = require('watson-developer-cloud');

        var text_to_speech = watson.text_to_speech({
          username: username,
          password: password,
          version: 'v1'
        });

        var params = {
          text: msg.payload,
          voice: config.voice,
          accept: 'audio/wav'
        };

        toArray(text_to_speech.synthesize(params), function (err, arr) {
          if (err) {
            console.log(err);
          } else {
            msg.speech = Buffer.concat(arr);
          }
          node.send(msg);
        })

      });
    }
  }
  RED.nodes.registerType("watson-text-to-speech", Node);
};
