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
  var request = require('request');
  var cfenv = require('cfenv');
  var fs = require('fs');

  var services = cfenv.getAppEnv().services, 
    service;

  if (services.visual_recognition) service = services.visual_recognition[0];

  RED.httpAdmin.get('/watson-visual-recognition/vcap', function(req, res) {
    res.json(service);
  });

  function Node(config) {
    RED.nodes.createNode(this,config);
    var node = this;

    if (!service) {
      node.error("No visual recognition service bound");
    } else {
      var cred = service.credentials;
      var username = cred.username;
      var password = cred.password;

      this.on('input', function(msg) {
        if (!msg.payload) {
          node.error('Missing property: msg.payload');
          return;
        }
        var watson = require('watson-developer-cloud');

        var visual_recognition = watson.visual_recognition({
          username: username,
          password: password,
          version: 'v1'
        });

        var s2t = function (image, cb) {
          var params = {
            image_file: image
          };
          visual_recognition.recognize(params, function(err, res) {
            if (err) {
              console.log(err);
            } else {
              msg.labels = res.images[0].labels;
            }

            node.send(msg);
            if (cb) cb();
          });
        }

        if (typeof msg.payload === 'string'){ 
          var temp = require('temp');
          temp.track();

          temp.open({suffix: '.jpg'}, function (err, info) {
            if (err) return;

            var wstream = fs.createWriteStream(info.path)
            wstream.on('finish', function () {
              s2t(fs.createReadStream(info.path), temp.cleanup);
            });

            request(msg.payload)
              .pipe(wstream);
          });
        } else if (msg.payload instanceof Buffer) {
          var streamifier = require('streamifier')
          s2t(streamifier.createReadStream(msg.payload));
        } else {
          node.error('Invalid property: msg.payload');
        }
      });
    }
  }
  RED.nodes.registerType("watson-visual-recognition",Node);
};
