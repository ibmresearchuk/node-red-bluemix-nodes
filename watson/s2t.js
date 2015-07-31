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
  var fileType = require('file-type');
  var temp = require('temp');
  var watson = require('watson-developer-cloud');
  temp.track();

  var username, password;

  var service = cfenv.getAppEnv().getServiceCreds(/speech to text/i)

  if (service) {
    username = service.username;
    password = service.password;
  }

  RED.httpAdmin.get('/watson-speech-to-text/vcap', function (req, res) {
    res.json(service ? {bound_service: true} : null);
  });

  function Node (config) {
    RED.nodes.createNode(this, config);
    var node = this;

    this.on('input', function (msg) {
      if (!msg.payload) {
        node.error('Missing property: msg.payload');
        return;
      }

      username = username || this.credentials.username;
      password = password || this.credentials.password;

      if (!username || !password) {
        node.error('Missing Speech To Text service credentials');
        return;
      }

      if (!msg.payload instanceof Buffer || !typeof msg.payload === 'string') {
        node.error('Invalid property: msg.payload, must be a URL or a Buffer.');
        return;
      }

      if (!config.lang) {
        node.error('Missing audio language configuration, unable to process speech.');
        return;
      }

      if (!config.band) {
        node.error('Missing audio band configuration, unable to process speech.');
        return;
      }

      var model = config.lang + '_' + config.band;
      var min_sample_rate = (config.band === 'NarrowbandModel' ? 8000 : 16000);

      var speech_to_text = watson.speech_to_text({
        username: username,
        password: password,
        version: 'v1',
        url: 'https://stream.watsonplatform.net/speech-to-text/api'
      });

      var s2t = function (audio, sample_rate, cb) {
        if (sample_rate < min_sample_rate) {
          node.error('Audio sample rate, ' + sample_rate + 'Hz, lower than minimum required sample rate for this model, ' + min_sample_rate + 'Hz.');
          return;
        }

        var params = {
          audio: audio,
          model: model,
          content_type: 'audio/wav'
        };

        speech_to_text.recognize(params, function (err, res) {
          if (err) {
            node.error(err);
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

      var is_wav_file = function (audioBuffer) {
        return (fileType(audioBuffer).ext === 'wav')
      }

      var wav_sample_rate = function (buffer) {
        if (!is_wav_file(buffer)) {
          node.error('Invalid filetype for msg.payload contents, must be a WAV file.')
          return null;
        }

        // WAV sample rate stored as 32 bit integer,
        // 24 bytes into the file header.
        return buffer.readInt32LE(24)
      };

      var find_sample_rate = function (buffer, cb) {
        var sample_rate = wav_sample_rate(buffer);
        if (sample_rate) {
          cb(sample_rate)
        }
      }

      var stream_buffer = function (file, contents, cb) {
        fs.writeFile(file, contents, function (err) {
          if (err) throw err;
          find_sample_rate(contents, cb)
        });
      };

      var stream_url = function (file, location, cb) {
        var wstream = fs.createWriteStream(file)
        wstream.on('finish', function () {
          fs.readFile(file, function (err, buf) {
            if (err) console.error(err);
            find_sample_rate(buf, cb)
          })
        });

        request(location)
        .pipe(wstream);
      };

      temp.open({suffix: '.wav'}, function (err, info) {
        if (err) throw err;

        var stream_payload = (typeof msg.payload === 'string') ? stream_url : stream_buffer;

        stream_payload(info.path, msg.payload, function (sample_rate) {
          s2t(fs.createReadStream(info.path), sample_rate, temp.cleanup);
        });
      });
    });
  }
  RED.nodes.registerType('watson-speech-to-text', Node, {
    credentials: {
      username: {type:"text"},
      password: {type:"password"}
    }
  });
};
