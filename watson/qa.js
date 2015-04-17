/**
 * Copyright 2013,2015 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
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

  if (services.question_and_answer) service = services.question_and_answer[0];

  RED.httpAdmin.get('/watson-question-answer/vcap', function (req, res) {
    res.json(service);
  });

  function QANode (config) {
    RED.nodes.createNode(this, config);
    var node = this;

    if (!service) {
      node.error('No question and answer service bound');
    } else {
      var username = service.credentials.username;
      var password = service.credentials.password;

      this.on('input', function (msg) {
        if (!msg.payload) {
          node.error('Missing property: msg.payload');
          return;
        }
        var output = config.output || 'top';
        var corpus = config.corpus || 'healthcare';

        var watson = require('watson-developer-cloud');
        var question_and_answer_healthcare = watson.question_and_answer({
          username: username,
          password: password,
          version: 'v1',
          dataset: corpus
        });

        question_and_answer_healthcare.ask({ text: msg.payload }, function (err, response) {
          if (err) node.error('API responses with error: ' + err);

          var answers = response[0].question.answers;
          var evidenceList = response[0].question.evidencelist;
          if (!err && answers) {
            if (output === 'top') {
              if (answers[0].pipeline.indexOf('TAO') > -1) {
                msg.payload = evidenceList[0].text;
              } else {
                msg.payload = answers[0].text;
              }
              msg.confidence = answers[0].confidence;
            } else if (output === 'all') {
              var all = [];

              for (var i = 0; i < answers.length; ++i) {
                var answerText;
                if (answers[i].pipeline.indexOf('TAO') > -1) {
                  answerText = evidenceList[i].text;
                } else {
                  answerText = answers[i].text;
                }
                var ans = {
                  payload: answerText,
                  confidence: answers[i].confidence
                };
                all.push(ans);
              }
              msg.payload = all;
            }
          } else {
            msg.payload = '';
          }
          node.send(msg);
        });
      });
    }
  }
  RED.nodes.registerType('watson-question-answer',QANode);
};
