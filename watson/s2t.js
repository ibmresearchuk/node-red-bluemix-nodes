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
  var request = require('request');
  var cfenv = require('cfenv');
  var fs = require('fs');

  var services = cfenv.getAppEnv().services,
    service;

  var username, password;

  var service = cfenv.getAppEnv().getServiceCreds(/speech to text/i)

  if (service) {
    username = service.username;
    password = service.password;
  }

  RED.httpAdmin.get('/watson-speech-to-text/vcap', function (req, res) {
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
        node.error('Missing Speech To Text service credentials');
        return;
      }

      var watson = require('watson-developer-cloud');

      var speech_to_text = watson.speech_to_text({
        username: username,
        password: password,
        version: 'v1'
      });

      var s2t = function (audio, cb) {
        var params = {
          audio: audio,
          content_type: 'audio/l16; rate=44100'
        };
        speech_to_text.recognize(params, function (err, res) {
          if (err) {
            console.log(err);
          } else {
            msg.transcription = '';
            if (res.results.length && res.results[0].alternatives.length) {
              msg.transcription = res.results[0].alternatives[0].transcript;
            }
          }

          node.send(msg);
          if (cb) cb();
        });
      }

      if (typeof msg.payload === 'string'){ 
        var temp = require('temp');
        temp.track();

        temp.open({suffix: '.wav'}, function (err, info) {
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
  RED.nodes.registerType('watson-speech-to-text', Node);
};
