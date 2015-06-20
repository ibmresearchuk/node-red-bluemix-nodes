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

var FEATURE_RESPONSES = {
  imageFaces: 'imageFaces',
  imageLink: "image",
  imageKeywords: "imageKeywords"
};

module.exports = function (RED) {
  var cfenv = require('cfenv'),
    AlchemyAPI = require('alchemy-api');

  var service = cfenv.getAppEnv().getServiceCreds(/alchemy/i);

  var apikey = service ? service.apikey : null;

  RED.httpAdmin.get('/alchemy-image-analysis/vcap', function (req, res) {
    res.json(service);
  });

  function AlchemyImageAnalysisNode (config) {
    RED.nodes.createNode(this, config);
    var node = this;

    this.on('input', function (msg) {
      if (!msg.payload) {
        node.error('Missing property: msg.payload');
        return;
      }

      apikey = apikey || config.apikey;

      if (!apikey) {
        node.error('Missing Alchemy API service credentials');
        return;
      }

      var alchemy = new AlchemyAPI(apikey);

      var feature = config["image-feature"];

      alchemy[feature](msg.payload, msg.alchemy_options || {}, function (err, response) {
        if (err || response.status === "ERROR") { 
          node.error('Alchemy API request error: ' + (err ? err : response.statusInfo)); 
          return;
        }

        msg.result = response[FEATURE_RESPONSES[feature]];
        node.send(msg)
      })
    });
  }

  RED.nodes.registerType('alchemy-image-analysis', AlchemyImageAnalysisNode);
};
