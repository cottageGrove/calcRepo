/**
 * Copyright 2015 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

var express = require('express'); // app server
var bodyParser = require('body-parser'); // parser for post requests
var AssistantV2 = require('watson-developer-cloud/assistant/v2'); // watson sdk

var app = express();

// Bootstrap application settings
app.use(express.static('./public')); // load UI from public folder
app.use(bodyParser.json());

// Create the service wrapper

var assistant = new AssistantV2({
  version: '2018-11-08'
});

var newContext = {
  global : {
    system : {
      turn_count : 1
    }
  }
};

// Endpoint to be call from the client side
app.post('/api/message', function (req, res) {
  var assistantId = process.env.ASSISTANT_ID || '<assistant-id>';
  if (!assistantId || assistantId === '<assistant-id>>') {
    return res.json({
      'output': {
        'text': 'The app has not been configured with a <b>ASSISTANT_ID</b> environment variable. Please refer to the ' + '<a href="https://github.com/watson-developer-cloud/assistant-simple">README</a> documentation on how to set this variable. <br>' + 'Once a workspace has been defined the intents may be imported from ' + '<a href="https://github.com/watson-developer-cloud/assistant-simple/blob/master/training/car_workspace.json">here</a> in order to get a working application.'
      }
    });
  }
  var contextWithAcc = (req.body.context) ? req.body.context : newContext;

  if (req.body.context) {
    contextWithAcc.global.system.turn_count += 1;
  }

  //console.log(JSON.stringify(contextWithAcc, null, 2));

  var textIn = '';

  if(req.body.input) {
    textIn = req.body.input.text;
  }

  var payload = {
    assistant_id: assistantId,
    session_id: req.body.session_id,
    context: contextWithAcc,
    input: {
      message_type : 'text',
      text : textIn,
      options : {
        return_context : true
      }
    }
  };

  // Send the input to the assistant service
  assistant.message(payload, function (err, data) {
    if (err) {
      return res.status(err.code || 500).json(err);
    }

    //Before returning the result, call the updateMessage() to provide an opportunity for the 
    //the response to be processed
    return res.json(updateMessage(payload, data)); 
    });
});

app.get('/api/session', function (req, res) {
  assistant.createSession({
    assistant_id: process.env.ASSISTANT_ID || '{assistant_id}',
  }, function (error, response) {
    if (error) {
      return res.send(error);
    } else {
      return res.send(response);
    }
  });
});

/**
 * The method processes the reponse by replacing the _result_ of the calculation with the 
 * actual result of the math operation expressed by the intent. For any other intent
 * the response is returned as is
 * @param  {Object} input The request to the Conversation service
 * @param  {Object} response The response from the Conversation service
 * @return {Object}          The response with the updated message
 */
function updateMessage(input, response) {
  var responseText = null;
  
  if (!response.output) {
    response.output = {};
  } else {
    // Check if the intent returned from Conversation service is add or multiply, 
    // perform the calculation and update the response. 
    // Starting with V2, intents are accessible through the output property of the response 
    // and not directly from the response object
    // Reference: https://cloud.ibm.com/apidocs/assistant-v2?language=node#send-user-input-to-assistant
  	if (response.output.intents.length > 0 && 
  		  (response.output.intents[0].intent === 'add' || 
  		   response.output. intents[0].intent === 'multiply')) {
			response = getCalculationResult(response);
	}
    return response;
  }
  
  if (response.output.intents && response.output.intents[0]) {
    var intent = response.intents[0];
    
    // Depending on the confidence of the response the app can return different messages.
    // The confidence will vary depending on how well the system is trained. The service will always try to assign
    // a class/intent to the input. If the confidence is low, then it suggests the service is unsure of the
    // user's intent . In these cases it is usually best to return a disambiguation message
    // ('I did not understand your intent, please rephrase your question', etc..)
    if (intent.confidence >= 0.75) {
      responseText = 'I understood your intent was ' + intent.intent;
    } else if (intent.confidence >= 0.5) {
      responseText = 'I think your intent was ' + intent.intent;
    } else {
      responseText = 'I did not understand your intent';
    }
  }
  
  response.output.text = responseText;
  return response;
}

/**
* Get the operands, perform the calculation and update the response text based on the
* calculation.     
* Starting with V2, intents and entities are accessible through the output property of the response 
* and not directly from the response object. The text property provided as a response is available
* through the response.output.generic object as responses can now include multiple response types
* Reference: https://cloud.ibm.com/apidocs/assistant-v2?language=node#send-user-input-to-assistant
* @param {Object} response The response from the Conversation service
* @return {Object} The response with the updated message
*/
function getCalculationResult(response){
	//An array holding the operands
	var numbersArr = [];
	
	//Fill the content of the array with the entities of type 'sys-number'
	for (var i = 0; i < response.output.entities.length; i++) {
		if (response.output.entities[i].entity === 'sys-number') {
			numbersArr.push(response.output.entities[i].value);
			}
	}
	
	// In case the user intent is add, perform the addition
	// In case the intent is multiply, perform the multiplication
	var result = 0;
	if (response.output.intents[0].intent === 'add') {
		result = parseInt(numbersArr[0]) + parseInt(numbersArr[1]);
	} else if (response.output.intents[0].intent === 'multiply') {
		result = parseInt(numbersArr[0]) * parseInt(numbersArr[1]);
	}
	
	// Replace _result_ in Conversation Service response, with the actual calculated result
	var output = response.output.generic[0].text;
	output = output.replace('_result_', result);
	response.output.generic[0].text = output;
	
	// Return the updated response text based on the calculation
	return response;
}

module.exports = app;