//
// Use to concat templates with code
//
module.exports = {
	dist: {
		src: [
			'dist/scripts/swagger-ui.js',
			'dist/scripts/swagger-client.js',
			'dist/scripts/swagger-model.js',
			'dist/scripts/templates.js'
		],
		dest: 'dist/scripts/swagger-ui.js'
	},
	copyright: {
		src: [
			'copyright.txt',
			'dist/scripts/swagger-ui.min.js'
		],
		dest: 'dist/scripts/swagger-ui.min.js'
	}
}