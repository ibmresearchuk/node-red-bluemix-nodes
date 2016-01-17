/**
 * Copyright 2013,2016 IBM Corp.
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
    "use strict";
    var reconnectTime = RED.settings.socketReconnectTime||10000;
    var socketTimeout = RED.settings.socketTimeout||null;
    var net = require('net');

    var connectionPool = {};

    function TcpIn(n) {
        RED.nodes.createNode(this,n);
        this.host = n.host;
        this.port = n.port * 1;
        this.topic = n.topic;
        this.stream = (!n.datamode||n.datamode=='stream'); /* stream,single*/
        this.datatype = n.datatype||'buffer'; /* buffer,utf8,base64 */
        this.newline = (n.newline||"").replace("\\n","\n").replace("\\r","\r");
        this.base64 = n.base64;
        this.server = (typeof n.server == 'boolean')?n.server:(n.server == "server");
        this.closing = false;
        var node = this;

        if (!node.server) {
            var buffer = null;
            var client;
            var reconnectTimeout;
            var setupTcpClient = function() {
                node.log("connecting to "+node.host+":"+node.port);
                node.status({fill:"grey",shape:"dot",text:"connecting"},true);
                var id = (1+Math.random()*4294967295).toString(16);
                client = net.connect(node.port, node.host, function() {
                    buffer = (node.datatype == 'buffer')? new Buffer(0):"";
                    node.log("connected to "+node.host+":"+node.port);
                    node.status({fill:"green",shape:"dot",text:"connected"},true);
                });
                connectionPool[id] = client;

                client.on('data', function (data) {
                    if (node.datatype != 'buffer') {
                        data = data.toString(node.datatype);
                    }
                    if (node.stream) {
                        if ((node.datatype) === "utf8" && node.newline != "") {
                            buffer = buffer+data;
                            var parts = buffer.split(node.newline);
                            for (var i = 0;i<parts.length-1;i+=1) {
                                var msg = {topic:node.topic, payload:parts[i]};
                                msg._session = {type:"tcp",id:id};
                                node.send(msg);
                            }
                            buffer = parts[parts.length-1];
                        } else {
                            var msg = {topic:node.topic, payload:data};
                            msg._session = {type:"tcp",id:id};
                            node.send(msg);
                        }
                    } else {
                        if ((typeof data) === "string") {
                            buffer = buffer+data;
                        } else {
                            buffer = Buffer.concat([buffer,data],buffer.length+data.length);
                        }
                    }
                });
                client.on('end', function() {
                    if (!node.stream || (node.datatype == "utf8" && node.newline != "" && buffer.length > 0)) {
                        var msg = {topic:node.topic,payload:buffer};
                        msg._session = {type:"tcp",id:id};
                        node.send(msg);
                        buffer = null;
                    }
                });
                client.on('close', function() {
                    delete connectionPool[id];
                    node.log("connection lost to "+node.host+":"+node.port);
                    node.status({fill:"red",shape:"ring",text:"disconnected"});
                    if (!node.closing) {
                        reconnectTimeout = setTimeout(setupTcpClient, reconnectTime);
                    }
                });
                client.on('error', function(err) {
                    node.log(err);
                });
            }
            setupTcpClient();

            this.on('close', function() {
                this.closing = true;
                client.end();
                clearTimeout(reconnectTimeout);
            });
        } else {
            var server = net.createServer(function (socket) {
                if (socketTimeout !== null) { socket.setTimeout(socketTimeout); }
                var id = (1+Math.random()*4294967295).toString(16);
                connectionPool[id] = socket;

                var buffer = (node.datatype == 'buffer')? new Buffer(0):"";
                socket.on('data', function (data) {
                    if (node.datatype != 'buffer') {
                        data = data.toString(node.datatype);
                    }

                    if (node.stream) {
                        if ((typeof data) === "string" && node.newline != "") {
                            buffer = buffer+data;
                            var parts = buffer.split(node.newline);
                            for (var i = 0;i<parts.length-1;i+=1) {
                                var msg = {topic:node.topic, payload:parts[i],ip:socket.remoteAddress,port:socket.remotePort};
                                msg._session = {type:"tcp",id:id};
                                node.send(msg);
                            }
                            buffer = parts[parts.length-1];
                        } else {
                            var msg = {topic:node.topic, payload:data};
                            msg._session = {type:"tcp",id:id};
                            node.send(msg);
                        }
                    } else {
                        if ((typeof data) === "string") {
                            buffer = buffer+data;
                        } else {
                            buffer = Buffer.concat([buffer,data],buffer.length+data.length);
                        }
                    }
                });
                socket.on('end', function() {
                    if (!node.stream || (node.datatype == "utf8" && node.newline != "" && buffer.length > 0)) {
                        var msg = {topic:node.topic,payload:buffer};
                        msg._session = {type:"tcp",id:id};
                        node.send(msg);
                        buffer = null;
                    }
                });
                socket.on('timeout', function() {
                    node.log('timeout closed socket port '+node.port);
                    socket.end();
                });
                socket.on('close', function() {
                    delete connectionPool[id];
                });
                socket.on('error',function(err) {
                    node.log(err);
                });
            });
            server.on('error', function(err) {
                if (err) {
                    node.error('unable to listen on port '+node.port+' : '+err);
                }
            });
            server.listen(node.port, function(err) {
                if (err) {
                    node.error('unable to listen on port '+node.port+' : '+err);
                } else {
                    node.log('listening on port '+node.port);

                    node.on('close', function() {
                        node.closing = true;
                        server.close();
                        node.log('stopped listening on port '+node.port);
                    });
                }
            });
        }
    }
    RED.nodes.registerType("tcp in",TcpIn);

    function TcpOut(n) {
        RED.nodes.createNode(this,n);
        this.host = n.host;
        this.port = n.port * 1;
        this.base64 = n.base64;
        this.beserver = n.beserver;
        this.name = n.name;
        this.closing = false;
        var node = this;

        if (!node.beserver||node.beserver=="client") {
            var reconnectTimeout;
            var client = null;
            var connected = false;

            var setupTcpClient = function() {
                node.log("connecting to "+node.host+":"+node.port);
                node.status({fill:"grey",shape:"dot",text:"connecting"},true);
                client = net.connect(node.port, node.host, function() {
                    connected = true;
                    node.log("connected to "+node.host+":"+node.port);
                    node.status({fill:"green",shape:"dot",text:"connected"},true);
                });
                client.on('error', function (err) {
                    node.log('error : '+err);
                });
                client.on('end', function (err) {
                });
                client.on('close', function() {
                    node.log("connection lost to "+node.host+":"+node.port);
                    node.status({fill:"red",shape:"ring",text:"disconnected"},true);
                    connected = false;
                    client.destroy();
                    if (!node.closing) {
                        reconnectTimeout = setTimeout(setupTcpClient,reconnectTime);
                    }
                });
            }
            setupTcpClient();

            node.on("input", function(msg) {
                if (connected && msg.payload != null) {
                    if (Buffer.isBuffer(msg.payload)) {
                        client.write(msg.payload);
                    } else if (typeof msg.payload === "string" && node.base64) {
                        client.write(new Buffer(msg.payload,'base64'));
                    } else {
                        client.write(new Buffer(""+msg.payload));
                    }
                }
            });

            node.on("close", function() {
                this.closing = true;
                client.end();
                clearTimeout(reconnectTimeout);
            });

        } else if (node.beserver == "reply") {
            node.on("input",function(msg) {
                if (msg._session && msg._session.type == "tcp") {
                    var client = connectionPool[msg._session.id];
                    if (client) {
                        if (Buffer.isBuffer(msg.payload)) {
                            client.write(msg.payload);
                        } else if (typeof msg.payload === "string" && node.base64) {
                            client.write(new Buffer(msg.payload,'base64'));
                        } else {
                            client.write(new Buffer(""+msg.payload));
                        }
                    }
                }
            });
        } else {
            var connectedSockets = [];
            var server = net.createServer(function (socket) {
                if (socketTimeout !== null) { socket.setTimeout(socketTimeout); }
                var remoteDetails = socket.remoteAddress+":"+socket.remotePort;
                node.log("connection from "+remoteDetails);
                connectedSockets.push(socket);
                socket.on('timeout', function() {
                    node.log('timeout closed socket port '+node.port);
                    socket.end();
                });
                socket.on('close',function() {
                    node.log("connection closed from "+remoteDetails);
                    connectedSockets.splice(connectedSockets.indexOf(socket),1);
                });
                socket.on('error',function() {
                    node.log("socket error from "+remoteDetails);
                    connectedSockets.splice(connectedSockets.indexOf(socket),1);
                });
            });
            node.on("input", function(msg) {
                if (msg.payload != null) {
                    var buffer;
                    if (Buffer.isBuffer(msg.payload)) {
                        buffer = msg.payload;
                    } else if (typeof msg.payload === "string" && node.base64) {
                        buffer = new Buffer(msg.payload,'base64');
                    } else {
                        buffer = new Buffer(""+msg.payload);
                    }
                    for (var i = 0; i<connectedSockets.length;i+=1) {
                        connectedSockets[i].write(buffer);
                    }
                }
            });

            server.on('error', function(err) {
                if (err) {
                    node.error('unable to listen on port '+node.port+' : '+err);
                }
            });

            server.listen(node.port, function(err) {
                if (err) {
                    node.error('unable to listen on port '+node.port+' : '+err);
                } else {
                    node.log('listening on port '+node.port);
                    node.on('close', function() {
                        server.close();
                        node.log('stopped listening on port '+node.port);
                    });
                }
            });
        }
    }
    RED.nodes.registerType("tcp out",TcpOut);

    function TcpGet(n) {
        RED.nodes.createNode(this,n);
        this.server = n.server;
        this.port = Number(n.port);
        this.out = n.out;
        this.splitc = n.splitc;

        if (this.out != "char") { this.splitc = Number(this.splitc); }
        else { this.splitc = this.splitc.replace("\\n",0x0A).replace("\\r",0x0D).replace("\\t",0x09).replace("\\e",0x1B).replace("\\f",0x0C).replace("\\0",0x00); } // jshint ignore:line

        var buf;
        if (this.out == "count") { buf = new Buffer(this.splitc); }
        else { buf = new Buffer(65536); } // set it to 64k... hopefully big enough for most TCP packets.... but only hopefully

        this.connected = false;
        var node = this;
        var client;

        this.on("input", function(msg) {
            var i = 0;
            if ((!Buffer.isBuffer(msg.payload)) && (typeof msg.payload !== "string")) {
                msg.payload = msg.payload.toString();
            }
            if (!node.connected) {
                client = net.Socket();
                if (socketTimeout !== null) { client.setTimeout(socketTimeout); }
                var host = node.server || msg.host;
                var port = node.port || msg.port;

                if (host && port) {
                    client.connect(port, host, function() {
                        //node.log("connected"");
                        node.status({fill:"green",shape:"dot",text:"connected"});
                        node.connected = true;
                        client.write(msg.payload);
                    });
                }
                else {
                    node.warn("Host not found");
                }

                client.on('data', function(data) {
                    if (node.out == "sit") { // if we are staying connected just send the buffer
                        msg.payload = data;
                        node.send(msg);
                    }
                    else if (node.splitc === 0) {
                        msg.payload = data;
                        node.send(msg);
                    }
                    else {
                        for (var j = 0; j < data.length; j++ ) {
                            if (node.out === "time")  {
                                // do the timer thing
                                if (node.tout) {
                                    i += 1;
                                    buf[i] = data[j];
                                }
                                else {
                                    node.tout = setTimeout(function () {
                                        node.tout = null;
                                        msg.payload = new Buffer(i+1);
                                        buf.copy(msg.payload,0,0,i+1);
                                        node.send(msg);
                                        if (client) { node.status({}); client.destroy(); }
                                    }, node.splitc);
                                    i = 0;
                                    buf[0] = data[j];
                                }
                            }
                            // count bytes into a buffer...
                            else if (node.out == "count") {
                                buf[i] = data[j];
                                i += 1;
                                if ( i >= node.splitc) {
                                    msg.payload = new Buffer(i);
                                    buf.copy(msg.payload,0,0,i);
                                    node.send(msg);
                                    if (client) { node.status({}); client.destroy(); }
                                    i = 0;
                                }
                            }
                            // look for a char
                            else {
                                buf[i] = data[j];
                                i += 1;
                                if (data[j] == node.splitc) {
                                    msg.payload = new Buffer(i);
                                    buf.copy(msg.payload,0,0,i);
                                    node.send(msg);
                                    if (client) { node.status({}); client.destroy(); }
                                    i = 0;
                                }
                            }
                        }
                    }
                });

                client.on('end', function() {
                    //console.log("END");
                    node.connected = false;
                    node.status({fill:"grey",shape:"ring",text:"disconnected"});
                    client = null;
                });

                client.on('close', function() {
                    //console.log("CLOSE");
                    node.connected = false;
                    if (node.done) { node.done(); }
                });

                client.on('error', function() {
                    //console.log("ERROR");
                    node.connected = false;
                    node.status({fill:"red",shape:"ring",text:"error"});
                    node.error("connect failed",msg);
                    if (client) { client.destroy(); }
                });

                client.on('timeout',function() {
                    //console.log("TIMEOUT");
                    node.connected = false;
                    node.status({fill:"grey",shape:"dot",text:"connect timeout"});
                    if (client) {
                        client.connect(port, host, function() {
                            node.connected = true;
                            node.status({fill:"green",shape:"dot",text:"connected"});
                        });
                    }
                });
            }
            else { client.write(msg.payload); }
        });

        this.on("close", function(done) {
            node.done = done;
            if (client) {
                buf = null;
                client.destroy();
            }
            node.status({});
            if (!node.connected) { done(); }
        });
    }
    RED.nodes.registerType("tcp request",TcpGet);
}
