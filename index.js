// PlanningCenterOnline-Services-Live

const { InstanceBase, Regex, runEntrypoint } = require('@companion-module/base')
var Client = require('node-rest-client').Client

const baseAPIUrl = 'https://api.planningcenteronline.com/services/v2'

function instance(internal) {
	var self = this
	super(internal)
}

instance.prototype.currentState = {
	internal: {},
	dynamicVariables: {},
	dynamicVariableDefinitions: {},
}

instance.prototype.init = async function (config) {
	var self = this
	
	self.actions();

	self.updateStatus('ok')

	self.initVariables()
	self.init_pcoserviceslive()
}

instance.prototype.configUpdated = async function (config) {
	var self = this
	self.config = config

	self.updateStatus('ok')

	self.initVariables()
	self.init_pcoserviceslive()
}

instance.prototype.init_pcoserviceslive = function () {
	var self = this

	let services_url = `${baseAPIUrl}/service_types`

	if (self.config.servicetypeid !== '') {
		let serviceTypeId = self.config.servicetypeid
		services_url += `/${serviceTypeId}`
	} else if (self.config.parentfolder !== '') {
		services_url += `?where[parent_id]=${self.config.parentfolder}`
	}

	let defaultPlanListObj = {}
	defaultPlanListObj.id = '0'
	defaultPlanListObj.label = `(select a plan)`

	if (
		self.config.applicationid !== '' &&
		self.config.applicationid !== undefined &&
		self.config.secretkey !== '' &&
		self.config.secretkey !== undefined
	) {
		self
			.doRest('GET', services_url, {})
			.then(function (result) {
				if (result.data.length > 0) {
					self.currentState.internal.plans_list = []
					self.currentState.internal.plans_list.push(defaultPlanListObj)
					self.processServicesData(result.data)
				} else if (result.data.id) {
					//just one service type returned
					self.currentState.internal.plans_list = []
					self.currentState.internal.plans_list.push(defaultPlanListObj)
					let serviceArray = []
					serviceArray.push(result.data)
					self.processServicesData(serviceArray)
				}
			})
			.catch(function (message) {
				console.log('****services url****')
				console.log(services_url)
				self.log('error', 'Error getting Services data: ' + message)
				self.updateStatus('unknown_error' , message)
			})
	}
}

instance.prototype.processServicesData = function (result) {
	var self = this

	self.currentState.internal.services = result

	let perpage = self.config.perpage

	if (result.length > 0) {
		self.currentState.internal.services_list = []
	}

	for (let i = 0; i < result.length; i++) {
		let serviceTypeId = result[i].id
		let plans_url = `${baseAPIUrl}/service_types/${serviceTypeId}/plans?filter=future&per_page=${perpage}&order=sort_date`

		let serviceListObj = {}
		serviceListObj.id = result[i].id
		serviceListObj.label = result[i].attributes.name
		self.currentState.internal.services_list.push(serviceListObj)

		self
			.doRest('GET', plans_url, {})
			.then(function (result) {
				self.processPlansData(result.data)
			})
			.catch(function (message) {
				self.log('error', 'Error processing Services data: ' + message)
				self.updateStatus('unknown_error' , message)
			})
	}
}

instance.prototype.processPlansData = function (result) {
	var self = this

	self.updateStatus('ok')
	let services = self.currentState.internal.services

	for (let j = 0; j < result.length; j++) {
		self.currentState.internal.plans.push(result[j])

		let planListObj = {}
		planListObj.id = result[j].id
		planListObj.serviceTypeId = result[j].relationships.service_type.data.id
		let serviceObj = services.find((s) => s.id === planListObj.serviceTypeId)
		planListObj.label = `${serviceObj.attributes.name} - ${result[j].attributes.dates} (${result[j].id})`
		self.currentState.internal.plans_list.push(planListObj)
	}

	self.actions()
}

// Return config fields for web config
instance.prototype.getConfigFields = function () {
	var self = this

	return [
		{
			type: 'static-text',
			id: 'info',
			width: 12,
			label: 'Information',
			value: 'You will need to setup a Personal Access Token in your PCO account.',
		},
		{
			type: 'textinput',
			id: 'applicationid',
			label: 'Application ID',
			width: 12,
		},
		{
			type: 'textinput',
			id: 'secretkey',
			label: 'Secret Key',
			width: 12,
		},
		{
			type: 'textinput',
			id: 'parentfolder',
			label: 'Parent Folder within PCO to limit service type choices for this instance.',
			width: 3,
			default: '',
		},
		{
			type: 'textinput',
			id: 'servicetypeid',
			label: 'Restrict plans to choose from to a specific service type id for this instance.',
			width: 3,
			default: '',
		},
		{
			type: 'textinput',
			id: 'perpage',
			label: 'The number of plans to return per service type. Default is 7.',
			width: 3,
			default: '7',
			regex: Regex.NUMBER,
		},
	]
}

// When module gets deleted
instance.prototype.destroy = async function () {
	var self = this

	self.log('debug', 'destroy')
}

// Set up available variables
instance.prototype.initVariables = function () {
	var self = this

	var variables = [
		{
			name: 'Plan Index',
			variableId: 'plan_index',
		},
		{
			name: 'Plan Length',
			variableId: 'plan_length',
		},
		{
			name: 'Plan Current Item',
			variableId: 'plan_currentitem',
		},
		{
			name: 'Plan Next Item',
			variableId: 'plan_nextitem',
		},
	]

	self.setVariableDefinitions(variables)

	// Initialize the current state and update Companion with the variables.
	self.emptyCurrentState()
}

/**
 * Updates the dynamic variable value but does not set it in Companion.
 *
 * Will log a warning if the variable doesn't exist.
 */
instance.prototype.updateVariableValue = function (variableId, value) {
	var self = this

	if (self.currentState.dynamicVariables[variableId] === undefined) {
		self.log('warn', 'Variable ' + variableId + 'does not exist')
		//return;
	}

	self.currentState.dynamicVariables[variableId] = value
}

/**
 * Updates all Companion variables at once.
 */
instance.prototype.updateAllVariables = function () {
	var self = this

	this.setVariableValues(self.currentState.dynamicVariables)
}

/**
 * Initialize an empty current variable state.
 */
instance.prototype.emptyCurrentState = function () {
	var self = this

	// Reinitialize the currentState variable, otherwise this variable (and the module's
	// state) will be shared between multiple instances of this module.
	self.currentState = {}

	// The internal state, list of services and plans in PCO
	self.currentState.internal = {
		services: [],
		plans: [],
		services_list: [{ id: '', label: 'No services loaded. Update instance config.' }],
		plans_list: [{ id: '', label: 'No plans loaded. Update instance config.' }],
		currentController: null,
	}

	// The dynamic variable exposed to Companion
	self.currentState.dynamicVariables = {
		plan_index: '',
		plan_length: '',
		plan_currentitem: '',
		plan_nextitem: '',
	}

	// Update Companion with the default state of the variables.
	self.updateAllVariables()
}

instance.prototype.init_presets = function () {
	var self = this
	var presets = []

	self.setPresetDefinitions(presets)
}

var actions = function (system) {
	var self = this

	self.setActionDefinitions({
		nextitem: {
			name: 'Go to Next Item',
			options: [
				{
					type: 'dropdown',
					label: 'PCO Plan',
					id: 'planid',
					choices: self.currentState.internal.plans_list,
					tooltip: 'PCO Service Plan to control.',
				},
			],
			callback: doAction,
		},
		previousitem: {
			name: 'Go to Previous Item',
			options: [
				{
					type: 'dropdown',
					label: 'PCO Plan',
					id: 'planid',
					choices: self.currentState.internal.plans_list,
					tooltip: 'PCO Service Plan to control.',
				},
			],
			callback: doAction,
		},
		nextitem_inservicetype: {
			name: 'Go to Next Item of Next Plan in Selected Service Type',
			options: [
				{
					type: 'dropdown',
					label: 'PCO Service Type',
					id: 'servicetypeid',
					choices: self.currentState.internal.services_list,
					tooltip: 'PCO Service Type',
				},
			],
			callback: doAction,
		},
		previousitem_inservicetype: {
			name: 'Go to Previous Item of Next Plan in Selected Service Type',
			options: [
				{
					type: 'dropdown',
					label: 'PCO Service Type',
					id: 'servicetypeid',
					choices: self.currentState.internal.services_list,
					tooltip: 'PCO Service Type',
				},
			],
			callback: doAction,
		},
		nextitem_specific: {
			name: 'Go to Next Item of a Specific Plan',
			options: [
				{
					type: 'textinput',
					label: 'PCO Service Type Id',
					id: 'servicetypeid',
					tooltip: 'PCO Service Type Id.',
				},
				{
					type: 'textinput',
					label: 'PCO Plan Id',
					id: 'planid',
					tooltip: 'PCO Plan Id.',
				},
			],
			callback: doAction,
		},
		previousitem_specific: {
			name: 'Go to Previous Item of a Specific Plan',
			options: [
				{
					type: 'textinput',
					label: 'PCO Service Type Id',
					id: 'servicetypeid',
					tooltip: 'PCO Service Type Id to control.',
				},
				{
					type: 'textinput',
					label: 'PCO Plan Id',
					id: 'planid',
					tooltip: 'PCO Plan Id to control.',
				},
			],
			callback: doAction,
		},
		takecontrol: {
			name: 'Take Control',
			options: [
				{
					type: 'dropdown',
					label: 'PCO Plan',
					id: 'planid',
					choices: self.currentState.internal.plans_list,
					tooltip: 'PCO Service Plan to control.',
				},
			],
			callback: doAction,
		},
		releasecontrol: {
			name: 'Release Control',
			options: [
				{
					type: 'dropdown',
					label: 'PCO Plan',
					id: 'planid',
					choices: self.currentState.internal.plans_list,
					tooltip: 'PCO Service Plan to control.',
				},
			],
			callback: doAction,
		},
		takecontrol_specific: {
			name: 'Take Control of a Specific Plan',
			options: [
				{
					type: 'textinput',
					label: 'PCO Service Type Id',
					id: 'servicetypeid',
					tooltip: 'PCO Service Type Id to control.',
				},
				{
					type: 'textinput',
					label: 'PCO Plan Id',
					id: 'planid',
					tooltip: 'PCO Plan Id to control.',
				},
			],
			callback: doAction,
		},
		releasecontrol_specific: {
			name: 'Release Control of a Specific Plan',
			options: [
				{
					type: 'textinput',
					label: 'PCO Service Type Id',
					id: 'servicetypeid',
					tooltip: 'PCO Service Type Id to control.',
				},
				{
					type: 'textinput',
					label: 'PCO Plan Id',
					id: 'planid',
					tooltip: 'PCO Plan Id to control.',
				},
			],
			callback: doAction,
		},
	})
}

var doAction = function (actionId) {
	var self = this
	var options = actionId.options

	let serviceTypeId = null
	let planId = null

	if (options.planid) {
		planId = options.planid
		let planObj = self.currentState.internal.plans_list.find((p) => p.id === planId)
		if (planObj) {
			if (planObj.serviceTypeId) {
				serviceTypeId = planObj.serviceTypeId

				switch (actionId.action) {
					case 'nextitem':
						self
							.takeControl(serviceTypeId, planId)
							.then(function (result) {
								self.updateStatus('ok')
								self.controlLive(serviceTypeId, planId, 'next')
							})
							.catch(function (message) {
								self.log('error', message)
								self.updateStatus('unknown_error' , message)
							})
						break
					case 'previousitem':
						self
							.takeControl(serviceTypeId, planId)
							.then(function (result) {
								self.updateStatus('ok')
								self.controlLive(serviceTypeId, planId, 'previous')
							})
							.catch(function (message) {
								self.log('error', message)
								self.updateStatus('unknown_error' , message)
							})
						break
					case 'nextitem_specific':
						self
							.takeControl(options.servicetypeid, planId)
							.then(function (result) {
								self.updateStatus('ok')
								self.controlLive(options.servicetypeid, planId, 'next')
							})
							.catch(function (message) {
								self.log('error', message)
								self.updateStatus('unknown_error' , message)
							})
						break
					case 'previousitem_specific':
						self
							.takeControl(options.servicetypeid, planId)
							.then(function (result) {
								self.updateStatus('ok')
								self.controlLive(options.servicetypeid, planId, 'previous')
							})
							.catch(function (message) {
								self.log('error', message)
								self.updateStatus('unknown_error' , message)
							})
						break
					case 'takecontrol':
						self
							.takeControl(serviceTypeId, planId)
							.then(function (result) {
								self.updateStatus('ok')
							})
							.catch(function (message) {
								self.log('error', message)
								self.updateStatus('unknown_error' , message)
							})
						break
					case 'releasecontrol':
						self
							.releaseControl(serviceTypeId, planId)
							.then(function (result) {
								self.updateStatus('ok')
							})
							.catch(function (message) {
								self.log('error', message)
								self.updateStatus('unknown_error' , message)
							})
						break
					case 'takecontrol_specific':
						self
							.takeControl(options.servicetypeid, planId)
							.then(function (result) {
								self.updateStatus('ok')
							})
							.catch(function (message) {
								self.log('error', message)
								self.updateStatus('unknown_error' , message)
							})
						break
					case 'releasecontrol_specific':
						self
							.releaseControl(options.servicetypeid, planId)
							.then(function (result) {
								self.updateStatus('ok')
							})
							.catch(function (message) {
								self.log('error', message)
								self.updateStatus('unknown_error' , message)
							})
						break
				}
			}
		}
	} else {
		//they didn't choose a specific plan

		switch (actionId.action) {
			case 'nextitem_inservicetype':
				//get the next plan id in the service type, then do the normal requests (take control, advance)
				serviceTypeId = options.servicetypeid
				self
					.getPlanIdOfServiceType(serviceTypeId)
					.then(function (planId) {
						self
							.takeControl(serviceTypeId, planId)
							.then(function (result) {
								self.updateStatus('ok')
								self.controlLive(serviceTypeId, planId, 'next')
							})
							.catch(function (message) {
								self.log('error', message)
								self.updateStatus('unknown_error' , message)
							})
					})
					.catch(function (message) {
						self.log('error', message)
						self.updateStatus('unknown_error' , message)
					})
				break
			case 'previousitem_inservicetype':
				serviceTypeId = options.servicetypeid
				self
					.getPlanIdOfServiceType(serviceTypeId)
					.then(function (planId) {
						self
							.takeControl(serviceTypeId, planId)
							.then(function (result) {
								self.updateStatus('ok')
								self.controlLive(serviceTypeId, planId, 'previous')
							})
							.catch(function (message) {
								self.log('error', message)
								self.updateStatus('unknown_error' , message)
							})
					})
					.catch(function (message) {
						self.log('error', message)
						self.updateStatus('unknown_error' , message)
					})
				break
		}
	}
}

instance.prototype.doRest = function (method, url, body) {
	var self = this

	return new Promise(function (resolve, reject) {
		function handleResponse(err, result) {
			if (
				err === null &&
				typeof result === 'object' &&
				(result.response.statusCode === 200 || result.response.statusCode === 201)
			) {
				// A successful response

				var objJson = {}

				if (result.data.length > 0) {
					try {
						objJson = JSON.parse(result.data.toString())
					} catch (error) {
						reject('Unable to parse JSON.')
					}
				}

				resolve(objJson)
			} else {
				// Failure. Reject the promise.
				var message = 'Unknown error'

				if (result !== undefined) {
					if (result.response !== undefined) {
						message = result.response.statusCode + ': ' + result.response.statusMessage
					} else if (result.error !== undefined) {
						// Get the error message from the object if present.
						message = result.error.code + ': ' + result.error.message
					}
				}

				reject(message)
			}
		}

		var options_auth = {}

		if (self.config.applicationid === '' || self.config.secretkey === '') {
			reject('Invalid Application ID/Secret Key.')
		} else {
			options_auth = {
				user: self.config.applicationid,
				password: self.config.secretkey,
			}

			var client = new Client(options_auth)

			switch (method) {
				case 'POST':
					client
						.post(url, function (data, response) {
							handleResponse(null, { data: data, response: response })
						})
						.on('error', function (error) {
							handleResponse(true, { error: error })
						})
					break
				case 'GET':
					client
						.get(url, function (data, response) {
							handleResponse(null, { data: data, response: response })
						})
						.on('error', function (error) {
							handleResponse(true, { error: error })
						})
					break
				default:
					throw new Error('Invalid method')
					break
			}
		}
	})
}

/* Takes control of the PCO plan which is needed before the plan can be changed. */
instance.prototype.takeControl = function (serviceTypeId, planId) {
	var self = this

	var live_url = `${baseAPIUrl}/service_types/${serviceTypeId}/plans/${planId}/live`

	var toggle_url = live_url + '/toggle_control'

	return new Promise(function (resolve, reject) {
		self
			.doRest('GET', live_url, {})
			.then(function (result) {
				if (result.data.links.controller === null) {
					//no one is controlling this plan, so let's take control
					self
						.doRest('POST', toggle_url, {})
						.then(function (result) {
							resolve(result)
						})
						.catch(function (message) {
							self.log('error', message)
							self.updateStatus('unknown_error' , message)
						})
				} else {
					//someone is in control, so let's check to see who it is
					if (result.data.links.controller === self.currentState.internal.currentController) {
						//no need to do anything, we are currently in control
						resolve(result)
					} else {
						//we aren't in control, so we need to take control by first toggling the controller to null
						self
							.doRest('POST', toggle_url, {})
							.then(function (result) {
								//now toggle it back to us
								self
									.doRest('POST', toggle_url, {})
									.then(function (result) {
										//we should be in control now, let's save the controller to an internal variable so we know who "we" are next time
										self.currentState.internal.currentController = result.data.links.controller
										resolve(result)
									})
									.catch(function (message) {
										self.log('error', message)
										self.updateStatus('unknown_error' , message)
									})
							})
							.catch(function (message) {
								self.log('error', message)
								self.updateStatus('unknown_error' , message)
							})
					}
				}
			})
			.catch(function (message) {
				self.log('error', 'Error Taking Control of Plan: ' + message)
				self.updateStatus('unknown_error' , message)
			})
	})
}

/* Releases control of the PCO plan */
instance.prototype.releaseControl = function (serviceTypeId, planId) {
	var self = this

	var live_url = `${baseAPIUrl}/service_types/${serviceTypeId}/plans/${planId}/live`
	var toggle_url = live_url + '/toggle_control'

	return new Promise(function (resolve, reject) {
		self
			.doRest('GET', live_url, {})
			.then(function (result) {
				if (result.data.links.controller !== null) {
					//let's release control
					self
						.doRest('POST', toggle_url, {})
						.then(function (result) {
							resolve(result)
						})
						.catch(function (message) {
							self.log('error', message)
							self.updateStatus('unknown_error' , message)
						})
				}
			})
			.catch(function (message) {
				self.log('error', 'Error Releasing Control of Plan: ' + message)
				self.updateStatus('unknown_error' , message)
			})
	})
}

instance.prototype.controlLive = function (serviceTypeId, planId, direction) {
	var self = this

	let baseUrl = `${baseAPIUrl}/service_types/${serviceTypeId}/plans/${planId}/live`

	let url

	switch (direction) {
		case 'next':
			url = baseUrl + '/go_to_next_item?include=items,current_item_time'
			break
		case 'previous':
			url = baseUrl + '/go_to_previous_item?include=items,current_item_time'
			break
	}

	self
		.doRest('POST', url, {})
		.then(function (result) {
			//plan was moved, let's process the results
			self.processLiveData(result)
		})
		.catch(function (message) {
			self.log('error', 'Error Controlling LIVE: ' + message)
			self.updateStatus('unknown_error' , message)
		})
}

instance.prototype.processLiveData = function (result) {
	var self = this

	if (result.errors) {
		self.log('error', result.errors)
		self.updateStatus('unknown_error' , result.errors)
	} else {
		let items = result.included

		let currentItemTimeId =
			result.data.relationships.current_item_time.data && result.data.relationships.current_item_time.data.id
		let currentItemTime = result.included.find((res) => res.type === 'ItemTime' && res.id === currentItemTimeId)
		let currentItemId =
			currentItemTime &&
			currentItemTime.relationships &&
			currentItemTime.relationships.item.data &&
			currentItemTime.relationships.item.data.id

		if (currentItemId) {
			let index = items.findIndex((i) => i.id === currentItemId)
			let item = items.find((i) => i.id === currentItemId)

			self.updateVariableValue('plan_index', index)
			self.updateVariableValue('plan_length', items.length)
			self.updateVariableValue('plan_currentitem', item.attributes.title)

			if (index < items.length) {
				let nextitem = items[index + 1]
				self.updateVariableValue('plan_nextitem', nextitem.attributes.title)
			}

			self.updateAllVariables()
		}
	}
}

instance.prototype.getPlanIdOfServiceType = function (serviceTypeId) {
	var self = this

	let plans_url = `${baseAPIUrl}/service_types/${serviceTypeId}/plans?filter=future&per_page=1&order=sort_date`

	return new Promise(function (resolve, reject) {
		self
			.doRest('GET', plans_url, {})
			.then(function (result) {
				resolve(result.data[0].id)
			})
			.catch(function (message) {
				self.log('error', message)
				self.updateStatus('unknown_error' , message)
			})
	})
}

InstanceBase.extendedBy(instance)
runEntrypoint(instance, [])
