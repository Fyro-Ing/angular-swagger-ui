/*
 * Orange angular-swagger-ui - v0.1.5
 *
 * (C) 2015 Orange, all right reserved
 * MIT Licensed
 */
'use strict';

angular
	.module('swaggerUi', ['ng', 'swaggerUiTemplates'])
	.directive('swaggerUi', function() {

		return {
			restrict: 'A',
			controller: 'swaggerUiController',
			templateUrl: 'templates/swagger-ui.html',
			scope: {
				url: '=',
				apiExplorer: '=',
				errorHandler: '=',
				apiExplorerTransform: '=',
				transformApiResponse: "="
			}
		};
	})
    .factory('Scopes', function () {
        var mem = {};

        return {
            store: function (key, value) {
                mem[key] = value;
            },
            get: function (key) {
                return mem[key];
            }
        };
    })
	.controller('swaggerUiController', ['$scope', '$http', '$sce', '$location', '$window', 'swaggerModel', 'swaggerClient', 'Scopes',
		function($scope, $http, $sce, $location, $window, swaggerModel, swaggerClient, Scopes) {

			Scopes.store('swaggerUiController', $scope);

			var swagger;

			// WARNING only Swagger 2.0 is supported (@see https://github.com/swagger-api/swagger-spec/blob/master/versions/2.0.md)
			// WARNING application/xml is not supported
			// WARNING authentication is not implemented, please use 'api-explorer-transform' directive's param to customize API calls

			function get(url, callback) {
				$scope.loading = true;
				var notifyError = typeof $scope.errorHandler === 'function';
				var headers = {};

				var request = {
					method: 'GET',
					url: url,
					headers: headers
				};

				// apply transform headers
				if (typeof $scope.apiExplorerTransform === 'function') {
					$scope.apiExplorerTransform(request);
				}

				// apply transform headers
				if (typeof $scope.transformApiResponse === 'function') {
					request.transformResponse = $scope.transformApiResponse;
				}

				// send request
				$http(request)
					.then(function(result) {
						$scope.loading = false;
						callback(result);
					},
                    function(result) {
						$scope.loading = false;
						if (notifyError) {
							$scope.errorHandler(result.data, result.status);
						}
					});
			}

			$scope.$watch('url', function(url) {
				//reset
				$scope.infos = {};
				$scope.resources = [];
				$scope.form = {};
				if (url && url !== '') {
					// load Swagger description
					var notifyError = typeof $scope.errorHandler === 'function';
					get(url, function(result) {
						swagger = result.data;
						if (swagger.swagger === '2.0') {
							parseV2(swagger);
						} else if (notifyError) {
							$scope.errorHandler('unsupported swagger version', '415');
						}
					});
				}
			});

			/**
			 * compute path and operation parameters
			 */
			function computeParameters(swagger, pathParameters, operation) {
				var i, j, k, l,
					operationParameters = operation.parameters || [],
					parameters = [].concat(operationParameters),
					found,
					pathParameter,
					operationParameter;

				for (i = 0, l = pathParameters.length; i < l; i++) {
					found = false;
					pathParameter = swaggerModel.resolveReference(swagger, pathParameters[i]);

					for (j = 0, k = operationParameters.length; j < k; j++) {
						operationParameter = swaggerModel.resolveReference(swagger, operationParameters[j]);
						if (pathParameter.name === operationParameter.name && pathParameter.in === operationParameter.in) {
							// overriden parameter
							found = true;
							break;
						}
					}
					if (!found) {
						// add path parameter to operation ones
						parameters.push(pathParameter);
					}
				}
				return parameters;
			}

			/**
			 * parses swagger description to ease HTML generation
			 */
			function parseV2() {
				$scope.infos = swagger.info;
				$scope.infos.scheme = swagger.schemes && swagger.schemes[0] || 'http';
				$scope.infos.basePath = swagger.basePath;
				$scope.infos.host = swagger.host;
				$scope.infos.description = $sce.trustAsHtml($scope.infos.description);

				var operationId = 0,
					paramId = 0,
					map = {},
					form = {},
					resources = [],
					openPath = $location.search().open,
					pathObject,
					pathParameters;

				// parse resources
				if (!swagger.tags) {
					resources.push({
						name: 'default',
						open: true
					});
					map['default'] = 0;
				} else {
					for (var i = 0, l = swagger.tags.length; i < l; i++) {
						var tag = swagger.tags[i];
						resources.push(tag);
						map[tag.name] = i;
					}
				}
				// parse operations
				for (var path in swagger.paths) {
					pathObject = swagger.paths[path];
					pathParameters = pathObject.parameters || [];
					delete pathObject.parameters;

					for (var httpMethod in pathObject) {
						var operation = pathObject[httpMethod];
						//TODO manage 'deprecated' operations ?
						operation.id = operationId;
						form[operationId] = {
							contentType: operation.consumes && operation.consumes.length === 1 ? operation.consumes[0] : 'application/json',
							responseType: operation.produces && operation.produces.length > 0 ? operation.produces.join(',') : 'application/json',
						};
						operation.httpMethod = httpMethod;
						operation.path = path;
						// parse operation's parameters
						for (var j = 0, params = operation.parameters = computeParameters(swagger, pathParameters, operation), k = params.length; j < k; j++) {
							//TODO manage 'collectionFormat' (csv, multi etc.) ?
							//TODO manage constraints (pattern, min, max etc.) ?
							var param = params[j];
							param.id = paramId;
							param.type = swaggerModel.getType(param);
							if (param.items && param.items.enum){
								param.enum = param.items.enum;
								param.default = param.items.default;
							}
							param.subtype = param.enum ? 'enum' : param.type;
							// put param into form scope
							form[operationId][param.name] = param.default || '';
							if (param.schema) {
								param.schema.display = 1; // display schema
								param.schema.json = swaggerModel.generateSampleJson(swagger, param.schema, operation.consumes);
								param.schema.model = $sce.trustAsHtml(swaggerModel.generateModel(swagger, param.schema));
							}
							if (param.in === 'body') {
								operation.consumes = operation.consumes || ['application/json'];
							}
							paramId++;
						}
						// parse operation's responses
						if (operation.responses) {
							for (var code in operation.responses) {
								//TODO manage headers, examples ?
								var resp = operation.responses[code];
								resp.description = $sce.trustAsHtml(resp.description);
								if (resp.schema) {
									resp.schema.json = swaggerModel.generateSampleJson(swagger, resp.schema, operation.produces);
									if (resp.schema.type === 'object' || resp.schema.type === 'array' || resp.schema.$ref) {
										resp.display = 1; // display schema
										resp.schema.model = $sce.trustAsHtml(swaggerModel.generateModel(swagger, resp.schema));
									} else if (resp.schema.type === 'string') {
										delete resp.schema;
									}

									operation.hasResponses = true;
								} else {
									operation.hasResponses = true;
								}
							}
						}
						operation.tags = operation.tags || ['default'];
						// map operation to resource
						var tag = operation.tags[0];
						if (typeof map[tag] === 'undefined') {
							map[tag] = resources.length;
							resources.push({
								name: tag
							});
						}
						var res = resources[map[operation.tags[0]]];
						operation.open = openPath === operation.operationId || openPath === res.name + '*';
						res.operations = res.operations || [];
						res.operations.push(operation);
						if (operation.open) {
							res.open = true;
						}
						operationId++;
					}
				}
				// cleanup resources
				for (var i = 0; i < resources.length; i++) {
					var res = resources[i],
						operations = resources[i].operations;

					res.open = res.open || openPath === res.name || openPath === res.name + '*';
					if (!operations || (operations && operations.length === 0)) {
						resources.splice(i, 1);
					}
				}
				// sort resources alphabeticaly
				resources.sort(function(a, b) {
					if (a.name > b.name) {
						return 1;
					} else if (a.name < b.name) {
						return -1;
					}
					return 0;
				});
				// clear cache
				swaggerModel.clearCache();
				// display swagger
				$scope.form = form;
				$scope.resources = resources;
			}

			/**
			 * show all resource's operations as list or as expanded list
			 */
			$scope.expand = function(resource, expandOperations) {
				resource.open = true;
				for (var i = 0, op = resource.operations, l = op.length; i < l; i++) {
					op[i].open = expandOperations;
				}
			};

			$scope.permalink = function(name) {
				$location.search('open', name);
			};

			/**
			 * sends a sample API request
			 */
			$scope.submitExplorer = function(operation) {
				operation.loading = true;
				swaggerClient
					.send(swagger, operation, $scope.form[operation.id], $scope.apiExplorerTransform)
					.then(function(result) {
						operation.loading = false;
						operation.explorerResult = result;

						if(result.response.body instanceof Blob){
							var blob = result.response.body;
							var fileURL = URL.createObjectURL(blob);
							$window.open(fileURL);
						}
					});
			};

		}
	])
	.directive('fileInput', function() {
		// helper to be able to retrieve HTML5 File in ngModel from input
		return {
			restrict: 'A',
			require: 'ngModel',
			link: function(scope, element, attr, ngModel) {
				element.bind('change', function() {
					scope.$apply(function() {
						//TODO manage multiple files ?
						ngModel.$setViewValue(element[0].files[0]);
					});
				});
			}
		};
	});
/*
 * Orange angular-swagger-ui - v0.1.5
 *
 * (C) 2015 Orange, all right reserved
 * MIT Licensed
 */
'use strict';

angular
	.module('swaggerUi')
	.service('swaggerClient', ['$q', '$http', '$sce', function($q, $http, $sce) {

		function formatResult(deferred, result) {
			var query = '', headers = angular.extend({}, result.config.headers,result.headers());
			if (result.config.params) {
				var parts = [];
				for (var key in result.config.params) {
					if (Array.isArray(result.config.params[key])) {
						for (var val in result.config.params[key]) {
							parts.push(
								key + '=' + encodeURIComponent(result.config.params[key][val]));
						}
					} else {
						parts.push(
							key + '=' + encodeURIComponent(result.config.params[key]));
					}
				}
				if (parts.length > 0) {
					query = '?' + parts.join('&');
				}
			}

			deferred.resolve({
				url: result.config.url + query,
				response: {
					body: angular.isDefined(result.data) ? (angular.isString(result.data) || result.data instanceof Blob ? result.data : angular.toJson(result.data, true)) : 'no content',
					status: result.status,
					headers: angular.toJson(headers, true),
					contentType: result.headers('content-type')
				}
			});
		}

		function decodeToUtf8(data) {
			var encoding = 'utf-8';
			// The TextDecoder interface is documented at http://encoding.spec.whatwg.org/#interface-textdecoder
			var dataView = new DataView(data);
			// The TextDecoder interface is documented at http://encoding.spec.whatwg.org/#interface-textdecoder
			var decoder = new TextDecoder(encoding);
			return decoder.decode(dataView);
		}

		this.send = function(swagger, operation, values, transform) {
			var deferred = $q.defer(),
				query = {},
				headers = {},
				path = operation.path;

			// build request parameters
			for (var i = 0, params = operation.parameters || [], l = params.length; i < l; i++) {
				//TODO manage 'collectionFormat' (csv etc.) !!
				var param = params[i],
					value = values[param.name];

				switch (param.in) {
					case 'query':
						if (!!value) {
							query[param.name] = value;
						}
						break;
					case 'path':
						path = path.replace('{' + param.name + '}', encodeURIComponent(value));
						break;
					case 'header':
						if (!!value) {
							headers[param.name] = value;
						}
						break;
					case 'formData':
						if (!!value) {
							if (param.type === 'file') {
                                values.body = values.body || new FormData();
								values.contentType = undefined; // make browser defining it by himself
                                values.body.append(param.name, value);
                            } else {
                                values.body = values.body || {};
                                values.body[param.name] = value;
                            }
						}
						break;
                    case 'body':
                        values.body = value;
                        break;
				}
			}

			// add headers
			headers.Accept = values.responseType;
			headers['Content-Type'] = values.body ? values.contentType : 'text/plain';

			// build request
			//FIXME should use server hosting the documentation if scheme or host are not defined
			var request = {
					method: operation.httpMethod,
					url: [swagger.schemes && swagger.schemes[0] || 'http', '://', swagger.host, swagger.basePath || '', path].join(''),
					headers: headers,
					data: values.body,
					params: query
				},
				callback = function(result) {
					formatResult(deferred, result);
				};

			// apply transform
			if (typeof transform === 'function') {
				transform(request);
			}

			if(operation.produces && operation.produces.indexOf('application/pdf') !== -1){
				request.responseType = 'arraybuffer';
				request.transformResponse = function (data, headers) {
					var result = data;
					if (data && 'application/pdf' === headers('content-type')) {
						result = new Blob([data], {type: 'application/pdf', name: 'contract.pdf'});
					} else if (data && 'TextDecoder' in window) {
						result = decodeToUtf8(data);
					} else if (data) {
						result = String.fromCharCode.apply(null, new Uint8Array(data));
					}
					return result;
				};
			}

			// send request
			$http(request)
				.then(callback, callback);

			return deferred.promise;
		};

	}]);

/*
 * Orange angular-swagger-ui - v0.1.5
 *
 * (C) 2015 Orange, all right reserved
 * MIT Licensed
 */
'use strict';

angular
	.module('swaggerUi')
	.service('swaggerModel', ['$httpParamSerializerJQLike', function($httpParamSerializerJQLike) {

		/**
		 * sample object cache to avoid generating the same one multiple times
		 */
		var objCache = {};

		/**
		 * model cache to avoid generating the same one multiple times
		 */
		var modelCache = {};

		/**
		 * retrieves object definition
		 */
		var resolveReference = this.resolveReference = function(swagger, object) {
			if (object.$ref) {
				var parts = object.$ref.replace('#/', '').split('/');
				object = swagger;
				for (var i = 0, j = parts.length; i < j; i++) {
					object = object[parts[i]];
				}
			}
			return object;
		};

		/**
		 * determines a property type
		 */
		var getType = this.getType = function(item) {
			var format = item.format;
			switch (format) {
				case 'int32':
					format = item.type;
					break;
				case 'int64':
					format = 'long';
					break;
			}
			return format || item.type;
		};

		/**
		 * retrieves object class name based on definition
		 */
		function getClassName(schema) {
			return schema.$ref.replace('#/definitions/', '');
		}

		/**
		 * generates a sample object (request body or response body)
		 */
		function getSampleObj(swagger, schema) {
			var sample;
			if (schema.default || schema.example) {
				sample = schema.default || schema.example;
			} else if (schema.properties) {
				sample = {};
				for (var name in schema.properties) {
					sample[name] = getSampleObj(swagger, schema.properties[name]);
				}
			} else if (schema.$ref) {
				// complex object
				var def = swagger.definitions && swagger.definitions[getClassName(schema)];
				if (def) {
					if (!objCache[schema.$ref]) {
						// object not in cache
						objCache[schema.$ref] = getSampleObj(swagger, def);
					}
					sample = objCache[schema.$ref];
				}
			} else if (schema.type === 'array') {
				sample = [getSampleObj(swagger, schema.items)];
			} else if (schema.hasOwnProperty('allOf')) {
				sample = {};
				for (var index in schema.allOf) {
					var allOf = schema.allOf[index];
					sample =_.extend(sample,(getSampleObj(swagger, allOf)));
				}
			} else if (schema.type === 'object') {
				sample = {};
			} else {
				sample = getSampleValue(getType(schema));
			}
			return sample;
		}

		/**
		 * generates a sample value for a basic type
		 */
		function getSampleValue(type) {
			var result;
			switch (type) {
				case 'long':
				case 'integer':
					result = 0;
					break;
				case 'boolean':
					result = false;
					break;
				case 'double':
				case 'number':
					result = 0.0;
					break;
				case 'string':
					result = 'string';
					break;
				case 'date':
					result = (new Date()).toISOString().split('T')[0];
					break;
				case 'date-time':
					result = (new Date()).toISOString();
					break;
			}
			return result;
		}

		/**
		 * generates a sample JSON string (request body or response body)
		 */
        this.generateSampleJson = function (swagger, schema, contentTypes) {
            var json,
                obj = getSampleObj(swagger, schema),
                contentType;

			json = angular.toJson(obj, true);
            return json;
        };

		var countInLine = 0;

		var generateProperties = this.generateProperties = function(swagger, schema, buffer, submodels) {

			function isRequired(item, name) {
				return item.required && item.required.indexOf(name) !== -1;
			}

			for (var propertyName in schema.properties) {
				var property = schema.properties[propertyName];
				buffer.push('<div class="pad"><strong>', propertyName, '</strong> (<span class="type">');
				// build type
				if (property.properties) {
					buffer.push(propertyName);
					submodels.push(generateModel(swagger, property, propertyName));
				} else if (property.$ref) {
					buffer.push(getClassName(property));
					submodels.push(generateModel(swagger, property));
				} else if (property.type === 'array') {
					buffer.push('Array[');
					if (property.items.properties) {
						buffer.push(propertyName);
						submodels.push(generateModel(swagger, property, propertyName));
					} else if (property.items.$ref) {
						buffer.push(getClassName(property.items));
						submodels.push(generateModel(swagger, property.items));
					} else {
						buffer.push(getType(property.items));
					}
					buffer.push(']');
				} else {
					buffer.push(getType(property));
				}
				buffer.push('</span>');
				// is required ?
				if (!isRequired(schema, propertyName)) {
					buffer.push(', ', '<em>optional</em>');
				}
				buffer.push(')');
				// has description
				if (property.description) {
					buffer.push(': ', property.description);
				}
				// is enum
				if (property.enum) {
					buffer.push(' = ', angular.toJson(property.enum).replace(/,/g, ' or '));
				}
				buffer.push(',</div>');
			}
		};

		/**
		 * generates object's model
		 */
		var generateModel = this.generateModel = function(swagger, schema, modelName) {
			var model = '';

			if (schema.properties) {
				modelName = modelName || ('Inline Model' + countInLine++);
				var buffer = ['<div><strong>' + modelName + ' {</strong>'],
					submodels = [];

				generateProperties(swagger, schema, buffer, submodels);

				buffer.pop();
				buffer.push('</div>');
				buffer.push('<strong>}</strong>');
				buffer.push(submodels.join(''), '</div>');
				model = buffer.join('');
			} else if (schema.$ref) {
				var className = getClassName(schema),
					def = swagger.definitions && swagger.definitions[className];

				if (def) {
					if (!modelCache[schema.$ref]) {
						// cache generated object
						modelCache[schema.$ref] = generateModel(swagger, def, className);
					}
					model = modelCache[schema.$ref];
				}
			} else if (schema.type === 'array') {
				var buffer = ['<strong>Array ['];
				var sub = '';
				if (schema.items.properties) {
					var name = 'Inline Model' + countInLine++;
					buffer.push(name);
					sub = generateModel(swagger, schema.items, name);
				} else if (schema.items.$ref) {
					buffer.push(getClassName(schema.items));
					sub = generateModel(swagger, schema.items);
				} else {
					buffer.push(getType(schema.items));
				}
				buffer.push(']</strong><br><br>', sub);
				model = buffer.join('');
			} else if (schema.type === 'object') {
				model = '<strong>Inline Model {<br>}</strong>';
			} else if (schema.allOf) {
				modelName = modelName || ('Inline Model' + countInLine++);
				var buffer = ['<div><strong>' + modelName + ' {</strong>'],
					submodels = [];

				//generateProperties(swagger, schema, buffer, submodels);
				buffer.push('<div class="pad"><strong>### allOf</strong> [');
				for(var index in schema.allOf) {
					var allOf = schema.allOf[index];
					var sub = generateModel(swagger, allOf, allOf.description);
					buffer.push(sub);
				}

				buffer.push(',</div>');

				buffer.pop();
				buffer.push('</div>');
				buffer.push('<strong>}</strong>');
				buffer.push(submodels.join(''), '</div>');
				model = buffer.join('');
			} else if(schema.enum){
				var buffer =  ['<div><strong>' + modelName + '</strong>(<span class="type">' + schema.type + '</span>) <strong>{</strong>'];
				buffer.push('<div class="pad">');
				buffer.push(schema.description + ' = ');
				buffer.push(angular.toJson(schema.enum).replace(/,/g, ' or '));
				buffer.push('</div>');
				buffer.push('<strong>}</strong></div>');

				model = buffer.join('');
			}
			return model;
		};

		/**
		 * clears generated models cache
		 */
		this.clearCache = function() {
			objCache = {};
			modelCache = {};
		};

	}]);
angular.module('swaggerUiTemplates', ['templates/swagger-ui.html']);

angular.module('templates/swagger-ui.html', []).run(['$templateCache', function ($templateCache) {
  $templateCache.put('templates/swagger-ui.html',
    '<div class="swagger-ui" aria-live="polite" aria-relevant="additions removals"> <h3 class="swagger-loading" ng-if="loading">loading ...</h3> <div class="api-name"> <h3 ng-bind="infos.title"></h3> </div> <div class="api-description" ng-bind-html="infos.description"></div> <div class="api-infos"> <div class="api-infos-contact" ng-if="infos.contact"> <div ng-if="infos.contact.name" class="api-infos-contact-name">created by <span ng-bind="infos.contact.name"></span></div> <div ng-if="infos.contact.url" class="api-infos-contact-url">see more at <a href="{{infos.contact.url}}" ng-bind="infos.contact.url"></a></div> <a ng-if="infos.contact.email" class="api-infos-contact-url" href="mailto:{{infos.contact.email}}?subject={{infos.title}}">contact the developer</a> </div> <div class="api-infos-license" ng-if="infos.license"> <span>license: </span><a href="{{infos.license.url}}" ng-bind="infos.license.name"></a> </div> </div> <ul class="list-unstyled endpoints"> <li ng-repeat="api in resources" class="endpoint" ng-class="{active:api.open, hidden:api.show !== undefined && !api.show}"> <div class="clearfix"> <ul class="list-inline pull-left endpoint-heading"> <li> <h4> <a href="javascript:;" ng-click="api.open=!api.open;permalink(api.open?api.name:null)" ng-bind="api.name"></a> <span ng-if="api.description"> : <span ng-bind="api.description"></span></span> </h4> </li> </ul> <ul class="list-inline pull-right endpoint-actions"> <li> <a href="javascript:;" ng-click="api.open=!api.open;permalink(api.open?api.name:null)">open/hide</a> </li> <li> <a href="javascript:;" ng-click="expand(api);permalink(api.name)">list operations</a> </li> <li> <a href="javascript:;" ng-click="expand(api,true);permalink(api.name+\'*\')">expand operations</a> </li> </ul> </div> <ul class="list-unstyled collapse operations" ng-class="{in:api.open}"> <li ng-repeat="op in api.operations" class="operation {{op.httpMethod}}"> <div class="heading"> <a ng-click="op.open=!op.open;permalink(op.open?op.operationId:null)" href="javascript:;"> <div class="clearfix"> <span class="http-method text-uppercase" ng-bind="op.httpMethod"></span> <span class="path" ng-bind="op.path"></span> <span class="description pull-right" ng-bind="op.summary"></span> </div> </a> </div> <div class="content collapse" ng-class="{in:op.open}"> <div ng-if="op.description"> <h5>implementation notes</h5> <p ng-bind="op.description"></p> </div> <form role="form" name="explorerForm" ng-submit="explorerForm.$valid&&submitExplorer(op)"> <div ng-if="op.responseClass" class="response"> <h5>response class (status {{op.responseClass.status}})</h5> <div ng-if="op.responseClass.display!==-1"> <ul class="list-inline schema"> <li><a href="javascript:;" ng-click="op.responseClass.display=0" ng-class="{active:op.responseClass.display===0}">model</a></li> <li><a href="javascript:;" ng-click="op.responseClass.display=1" ng-class="{active:op.responseClass.display===1}">model schema</a></li> </ul> <pre class="model" ng-if="op.responseClass.display===0" ng-bind-html="op.responseClass.schema.model"></pre> <pre class="model-schema" ng-if="op.responseClass.display===1" ng-bind="op.responseClass.schema.json"></pre> </div> <div ng-if="op.produces" class="content-type"> <label for="responseContentType{{op.id}}">response content type</label> <select ng-model="form[op.id].responseType" ng-options="item for item in op.produces track by item" id="responseContentType{{op.id}}" name="responseContentType{{op.id}}" required></select> </div> </div> <div ng-if="op.parameters&&op.parameters.length>0" class="table-responsive"> <h5>parameters</h5> <table class="table table-condensed parameters"> <thead> <tr> <th class="name">parameter</th> <th class="value">value</th> <th class="desc">description</th> <th class="type">parameter type</th> <th class="data">data type</th> </tr> </thead> <tbody> <tr ng-repeat="param in op.parameters"> <td ng-class="{bold:param.required}"> <label for="param{{param.id}}" ng-bind="param.name"></label> </td> <td ng-class="{bold:param.required}"> <div ng-if="apiExplorer"> <div ng-if="param.in!==\'body\'" ng-switch="param.subtype"> <input ng-switch-when="file" type="file" file-input ng-model="form[op.id][param.name]" id="param{{param.id}}" placeholder="{{param.required?\'(required)\':\'\'}}" ng-required="param.required"> <select multiple ng-switch-when="enum" ng-model="form[op.id][param.name]" id="param{{param.id}}"> <option ng-repeat="value in param.enum" value="{{value}}" ng-bind="value+(param.default===value?\' (default)\':\'\')" ng-selected="param.default===value"></option> </select> <input ng-switch-default type="text" ng-model="form[op.id][param.name]" id="param{{param.id}}" placeholder="{{param.required?\'(required)\':\'\'}}" ng-required="param.required"> </div> <div ng-if="param.in===\'body\'"> <textarea id="param{{param.id}}" ng-model="form[op.id][param.name]" ng-required="param.required"></textarea> <br> <div ng-if="op.consumes" class="content-type"> <label for="bodyContentType{{op.id}}">parameter content type</label> <select ng-model="form[op.id].contentType" id="bodyContentType{{op.id}}" name="bodyContentType{{op.id}}" ng-options="item for item in op.consumes track by item"></select> </div> </div> </div> <div ng-if="!apiExplorer"> <div ng-if="param.in!==\'body\'"> <div ng-if="param.default"><span ng-bind="param.default"></span> (default)</div> <div ng-if="param.enum"> <span ng-repeat="value in param.enum">{{value}}<span ng-if="!$last"> or </span></span> </div> <div ng-if="param.required"><strong>(required)</strong></div> </div> </div> </td> <td ng-class="{bold:param.required}" ng-bind="param.description"></td> <td ng-bind="param.in"></td> <td ng-if="param.type" ng-switch="param.type"> <span ng-switch-when="array" ng-bind="\'Array[\'+param.items.type+\']\'"></span> <span ng-switch-default ng-bind="param.type"></span> </td> <td ng-if="param.schema"> <ul class="list-inline schema"> <li><a href="javascript:;" ng-click="param.schema.display=0" ng-class="{active:param.schema.display===0}">model</a></li> <li><a href="javascript:;" ng-click="param.schema.display=1" ng-class="{active:param.schema.display===1}">model schema</a></li> </ul> <pre class="model" ng-if="param.schema.display===0&&param.schema.model" ng-bind-html="param.schema.model"></pre> <div class="model-schema" ng-if="param.schema.display===1&&param.schema.json"> <pre ng-bind="param.schema.json" ng-click="form[op.id][param.name]=param.schema.json" aria-described-by="help-{{param.id}}"></pre> <div id="help-{{param.id}}">click to set as parameter value</div> </div> </td> </tr> </tbody> </table> </div> <div class="table-responsive" ng-if="op.hasResponses"> <h5>response messages</h5> <table class="table responses"> <thead> <tr> <th class="code">HTTP status code</th> <th>reason</th> <th>response model</th> </tr> </thead> <tbody> <tr ng-repeat="(code, resp) in op.responses"> <td ng-bind="code"></td> <td ng-bind-html="resp.description"></td> <td> <ul ng-if="resp.schema&&resp.schema.model&&resp.schema.json" class="list-inline schema"> <li><a href="javascript:;" ng-click="resp.display=0" ng-class="{active:resp.display===0}">model</a></li> <li><a href="javascript:;" ng-click="resp.display=1" ng-class="{active:resp.display===1}">model schema</a></li> </ul> <pre class="model" ng-if="resp.display===0&&resp.schema&&resp.schema.model" ng-bind-html="resp.schema.model"></pre> <pre class="model-schema" ng-if="resp.display===1&&resp.schema&&resp.schema.json" ng-bind="resp.schema.json"></pre> </td> </tr> </tbody> </table> </div> <div ng-if="apiExplorer"> <button class="btn btn-default" ng-click="op.explorerResult=false;op.hideExplorerResult=false" type="submit" ng-disabled="op.loading" ng-bind="op.loading?\'loading...\':\'try it out!\'"></button> <a class="hide-try-it" ng-if="op.explorerResult&&!op.hideExplorerResult" ng-click="op.hideExplorerResult=true" href="javascript:;">hide response</a> </div> </form> <div ng-if="op.explorerResult" ng-show="!op.hideExplorerResult"> <h5>request URL</h5> <pre ng-bind="op.explorerResult.url"></pre> <h5>response body</h5> <pre ng-show="op.explorerResult.response.contentType !== \'text/html\'" ng-bind="op.explorerResult.response.body"></pre> <pre ng-show="op.explorerResult.response.contentType === \'text/html\'" ng-bind-html="op.explorerResult.response.body"></pre> <h5>response code</h5> <pre ng-bind="op.explorerResult.response.status"></pre> <h5>response headers</h5> <pre ng-bind="op.explorerResult.response.headers"></pre> </div> </div> </li> </ul> </li> </ul> <div class="api-version" ng-if="infos"> [BASE URL: <span class="h4" ng-bind="infos.basePath"></span>, API VERSION: <span class="h4" ng-bind="infos.version"></span>, HOST: <span class="h4" ng-bind="infos.scheme"></span>://<span class="h4" ng-bind="infos.host"></span>] </div> </div> ');
}]);
