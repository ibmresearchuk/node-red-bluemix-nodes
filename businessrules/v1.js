/**
 * Copyright 2016 IBM Corp.
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
module.exports = function(RED) {

	var _ = require('lodash'),
		https = require('https'), 
		url = require('url'),
    	vcap = JSON.parse(process.env.VCAP_SERVICES || "{}"),
    	services = null, serviceList = null,
    	parseXMLString = require('xml2js').parseString;

    services = vcap["businessrules"]||[];
    serviceList = services.map(function(s) { return s.name; });

	// make these names available to the node configuration
    RED.httpAdmin.get('/business-rules/vcap', function(req, res) {
        res.json(serviceList);
    });

	// used to get payload sample data (see UI)
    RED.httpAdmin.get('/business-rules/get-htds-test-uri/:serviceSelectedVal/:rulesetSelectedVal', function(req, res) {
    	var restUrl = null, rulesetSelectedVal = null, serviceSelectedVal = null;

    	rulesetSelectedVal = decodeURIComponent(req.params["rulesetSelectedVal"]);
    	serviceSelectedVal = decodeURIComponent(req.params["serviceSelectedVal"]);
		services.some(function (service) {
       		if (service.name === serviceSelectedVal) {
               	selectedService = service;
               	return true;
            }
            return false;
        });
		if (!selectedService) {
            res.json([]);
            return;
		}
		restUrl = url.parse(selectedService.credentials.executionRestUrl);
		var data = {};
		data.url = restUrl;
		data.username = selectedService.credentials.user;
		data.password = selectedService.credentials.password;
		res.json(data);
	});


    // return the rulesets deployed in a given service
    RED.httpAdmin.get('/business-rules/service/:name/rulesets', function(req, res) {

    	var serviceName = req.params["name"], selectedService = null;

		services.some(function (service) {
       		if (service.name === serviceName) {
               	selectedService = service;
               	return true;
            }
            return false;
        });

		if (!selectedService) {
            res.json([]);
            return;
		}
                        
		var restUrl = url.parse(selectedService.credentials.executionAdminRestUrl);

		// encode 'user:password' in Base64 string for basic authentication of the execution API
		var encodedCredentials = new Buffer(selectedService.credentials.user + ':' + selectedService.credentials.password).toString('base64');

		var headers = {
			'Content-Type' : 'application/json',
			'Authorization' : 'Basic ' + encodedCredentials // basic authentication header
		};

		var options = {
				host : restUrl.host,
				path : restUrl.path + "/v1/rulesets?accept=application/json",
				method : 'GET',
				headers : headers
			};
		
		var serviceReq = https.request(options, function(serviceResp, err) {

			serviceResp.setEncoding('utf-8');
			var responseString = '';

			serviceResp.on('data', function(data) {
				responseString += data;
			});

			serviceResp.on('end', function() {
				if (serviceResp.statusCode === 200) {
					// build a list of all rulesets
					// the list will start with the "latest" version
					// and then the explicit version numbers
					var latestVersions = [];					
					// extract ruleset ID only
					var rulesets = JSON.parse(responseString).map(function(s) {
						var components = s.id.split('/');
						var latest = components[0] + "/" + components[2];
						latestVersions.push("/" + latest);
						return "/" + s.id;
					});		
					// sort and keep only uniq services
					latestVersions.sort();
					latestVersions = _.uniq(latestVersions);					
					// a separator
					latestVersions.push("Previous versions :");
					// and all the full version rulesets
					rulesets.sort();
					res.json(latestVersions.concat(rulesets));
				} else {
					console.log("[businessrules] An unexpected response occured");
					console.log('[businessrules] Response string : ' + responseString);
					res.status(serviceResp.statusCode);
				}
			});

			serviceReq.on('error', function(e) {
				console.log("[businessrules] ", e.message);
				console.log('[businessrules] Response string : ' + responseString);
			});
		});

		serviceReq.end();				
    });


	function isJSONString(str) {
	    try {
	        JSON.parse(str);
	    } catch (e) {
	        return false;
	    }
	    return true;
	}

	function isXMLString(xml) {
		var b = true;
        var xmlDoc = parseXMLString(xml, function (err, result) {
        	if (err) {
        		b = false;
        	}
        });
        if (!xmlDoc || b===false)
        	return false;
        return true;
	}


	function verifyServiceCredentials(node, msg) {
		if (services.length == 0) {
			node.error("No Business Rules service bound");
			return false;
		}
		return true;
	} // function

	function checkSelectedServiceExists(node, msg, selectedService) {
		if (!selectedService) {
			node.error("No service selected. Please configure your Business Rules node.");
			return false;
		}
		services.some(function (service) {
			if (service.name === selectedService) {
				node.selectedService = service;
			    return true;
			   }
			 return false;
		});
		if (!node.selectedService)
		{
			var message = "Configuration Error : the selected Business Rules service "+selectedService+" is not available in configuration.";
			node.error(message);
			console.log("[businessrules] "+ message);
			return false;
		}
		return true;
	} // function


	function verifyPayload(node, msg, params) {
	    if (!msg.payload) {
	    	node.status({fill:'red', shape:'ring', text:'missing payload'});
	    	node.error('Missing property: msg.payload', msg);
	    	return false;
	    }
	    if (typeof msg.payload === 'boolean' || typeof msg.payload === 'number') {
	    	node.status({fill:'red', shape:'ring', text:'bad format payload'});
	    	node.error('Bad format : msg.payload must be a string', msg);
	    	return false;
	    }
	    params.payloadType = isJSONString(msg.payload) ? "application/json" : (isXMLString(msg.payload) ? "application/xml" : null );
	    if (params.payloadType === null)
	    {
	    	node.status({fill:'red', shape:'ring', text:'bad format payload'});
	    	node.error('Bad format : msg.payload must be a string representing a valid JSON or XML payload', msg);
	    	return false;
	    }
	    return true;
	 } // function

	function executeService(node, msg, config, params) {
		var restUrl = null, dataString = null, encodedCredentials = null, 
			headers = null, options = null, req = null, contentType = null;

		restUrl = url.parse(node.selectedService.credentials.executionRestUrl);
		dataString = msg.payload;
		encodedCredentials = new Buffer(node.selectedService.credentials.user + ':' + 
			node.selectedService.credentials.password).toString('base64');

		headers = {
			'Content-Type' : params.payloadType,
			'Content-Length' : dataString.length,
			'Authorization' : 'Basic ' + encodedCredentials
		};

		options = {
			host : restUrl.host,
			path : restUrl.path + config.ruleset,
			method : 'POST',
			headers : headers
		};

		req = https.request(options, function(resp) {
			var responseString = '';

			resp.setEncoding('utf-8');
			resp.on('data', function(data) {
				responseString += data;
			});

			resp.on('end', function() {
				if (resp.statusCode === 200) {
					msg.payload = responseString;
					node.send(msg);
				} else {
					console.log('[businessrules] An unexpected response occured : ' + resp.statusCode);
					console.log('[businessrules] Status Code : ' + resp.statusCode);
					console.log('[businessrules] Status Message : ' + resp.statusMessage);
					console.log('[businessrules] Response : \n ' + responseString );
					node.error('An unexpected response occured : \n ' + responseString);
				}
			});
		});
		req.on('error', function(e) {
			console.log("[businessrules] ", e.message);
			node.error(e.message);
		});
		req.write(dataString);
		req.end();
	} // function
  

	// the actual implementation of the call to the selected decision service in the selected Business Rules service
	function BusinessRulesNode(config) {

		var node = this;

		RED.nodes.createNode(this, config);

		node.on('input', function (msg) {    
	  		var params = {};
	  		node.status({});
	  		if (verifyServiceCredentials(node, msg) && 
	  			checkSelectedServiceExists(node, msg, config.service) &&
	  			verifyPayload(node, msg, params)) {

	  			executeService(node,msg,config, params);
	  		}
		});
	}
	RED.nodes.registerType("business-rules",BusinessRulesNode);
}; // module.export
