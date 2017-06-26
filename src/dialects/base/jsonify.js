const _ = require('lodash')

const jsonify = (obj) => {
  if (!obj) return obj

  if (Array.isArray(obj)) {
    return obj.map(jsonify)
  }

  if (typeof obj === 'object') {
    if (obj.toJS) {
      return jsonify(obj.toJS())
    }

    let newObj = {}
    Object.keys(obj).forEach((key) => {
      const value = obj[key]
      if (!_.isUndefined(value)) {
        newObj[key] = jsonify(value)
      }
    })

    return newObj
  }

  return obj
}

export default jsonify
