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
			var query = '';
			if (result.config.params) {
				var parts = [];
				for (var key in result.config.params) {
					parts.push(key + '=' + encodeURIComponent(result.config.params[key]));
				}
				if (parts.length > 0) {
					query = '?' + parts.join('&');
				}
			}

			deferred.resolve({
				url: result.config.url + query,
				response: {
					body: result.data ? (angular.isString(result.data) || result.data instanceof Blob ? result.data : angular.toJson(result.data, true)) : 'no content',
					status: result.status,
					headers: angular.toJson(result.headers(), true),
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