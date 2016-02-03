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

		function formatResult(deferred, data, status, headers, config) {
			var query = '';
			if (config.params) {
				var parts = [];
				for (var key in config.params) {
					parts.push(key + '=' + encodeURIComponent(config.params[key]));
				}
				if (parts.length > 0) {
					query = '?' + parts.join('&');
				}
			}

			deferred.resolve({
				url: config.url + query,
				response: {
					body: data ? (angular.isString(data) || data instanceof Blob ? data : angular.toJson(data, true)) : 'no content',
					status: status,
					headers: angular.toJson(headers(), true),
					contentType: headers('content-type')
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
						values.body = values.body || new FormData();
						if (!!value) {
							if (param.type === 'file') {
								values.contentType = undefined; // make browser defining it by himself
							}
							values.body.append(param.name, value);
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
				callback = function(data, status, headers, config) {
					formatResult(deferred, data, status, headers, config);
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
					} else if ('TextDecoder' in window) {
						result = decodeToUtf8(data);
					} else {
						result = String.fromCharCode.apply(null, new Uint8Array(data));
					}
					return result;
				};
			}

			// send request
			$http(request)
				.success(callback)
				.error(callback);

			return deferred.promise;
		};

	}]);