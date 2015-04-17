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

  if (services.relationship_extraction) service = services.relationship_extraction[0];

  RED.httpAdmin.get('/watson-relationship-extraction/vcap', function (req, res) {
    if (service) {
      res.json(service.credentials.sids);
      return;
    } 
    res.json(null);
  });

  function Node(config) {
    RED.nodes.createNode(this,config);
    var node = this;

    if (!service) {
      node.error("No relationship extraction service bound");
    } else {
      var cred = service.credentials;
      var username = cred.username;
      var password = cred.password;

      this.on('input', function (msg) {
        msg.dataset = config.dataset;

        if (msg.dataset == "") {                    
          node.warn("Dataset passed in on msg.dataset is invalid: message not analysed.");
          return;
        }
        if (!msg.payload) {
          node.error('Missing property: msg.payload');
          return;
        }

        var watson = require('watson-developer-cloud');

        var relationship_extraction = watson.relationship_extraction({
          username: username,
          password: password,
          version: 'v1'
        });

        relationship_extraction.extract({text: msg.payload, dataset: msg.dataset }, function (err, response) {
          if (err) {
            node.error(err);
            node.send(msg);
            return;
          }

          var parseString = require('xml2js').parseString;                    
          parseString(response, function (err, result) {                        
            msg.relationships = result;    
            node.send(msg);
          });
        });
      });
    }
  }
  RED.nodes.registerType("watson-relationship-extraction",Node);
};
