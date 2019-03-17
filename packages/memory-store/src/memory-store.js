import isEmpty from 'lodash/isEmpty';
import {mapFromOneOrMany} from '@storable/util';
import assert from 'assert';

export class MemoryStore {
  _collections = {};

  get({_type, _id}, {return: returnFields = true} = {}) {
    validateType(_type);
    validateId(_id);

    const document = this._collections[_type]?.[_id];

    if (document === undefined) {
      return undefined;
    }

    const result = {_type, _id};

    if (returnFields === false) {
      return result;
    }

    for (const [name, value] of Object.entries(document)) {
      let returnField = typeof returnFields === 'object' ? returnFields[name] : true;

      if (returnField === undefined || returnField === false) {
        continue;
      }

      if (Array.isArray(value) && !(returnField === true || Array.isArray(returnField))) {
        throw new Error(
          `Type mismatch (field: '${name}', expected: 'Boolean' or 'Array', provided: '${typeof returnField}')`
        );
      }

      if (Array.isArray(returnField)) {
        if (!Array.isArray(value)) {
          throw new Error(
            `Type mismatch (field: '${name}', expected: 'Boolean' or 'Object', provided: 'Array')`
          );
        }
        returnField = returnField[0];
      }

      result[name] = mapFromOneOrMany(value, value => {
        assert(value !== null, `The 'null' value is not allowed (field: '${name}')`);

        if (typeof value !== 'object') {
          if (returnField !== true) {
            throw new Error(
              `Type mismatch (field name: '${name})', expected: 'Boolean', provided: '${typeof returnField}'`
            );
          }
          return value;
        }

        const subdocument = value;

        if (subdocument._id === undefined) {
          if (returnField !== true) {
            throw new Error(
              `It is not possible to partially return nested documents (field name: '${name})'`
            );
          }
          return subdocument;
        }

        return this.get(subdocument, {return: returnField});
      });
    }

    return result;
  }

  set({_isNew, _type, _id, ...changes}) {
    validateType(_type);
    validateId(_id);

    let collection = this._collections[_type];
    if (collection === undefined) {
      collection = {};
      this._collections[_type] = collection;
    }

    let document = collection[_id];
    if (document === undefined) {
      if (!_isNew) {
        throw new Error(`Document not found (collection: '${_type}', id: '${_id}')`);
      }
      document = {};
      collection[_id] = document;
    } else if (_isNew) {
      throw new Error(`Document already exists (collection: '${_type}', id: '${_id}')`);
    }

    for (let [name, value] of Object.entries(changes)) {
      value = normalizeValue(value, {fieldName: name});

      if (value === undefined) {
        delete document[name];
        continue;
      }

      document[name] = mapFromOneOrMany(value, value => {
        value = normalizeValue(value, {fieldName: name});

        if (typeof value !== 'object') {
          return value;
        }

        const {_isNew, _type, _id, ...changes} = value;

        if (_id === undefined) {
          return {_type, ...changes};
        }

        validateType(_type);
        validateId(_id);

        if (_isNew || !isEmpty(changes)) {
          this.set({_isNew, _type, _id, ...changes});
        }

        return {_type, _id};
      });
    }
  }

  delete({_type, _id, ...referencedDocuments}) {
    validateType(_type);
    validateId(_id);

    const result = {};

    // Let's handle the referenced documents first
    for (const [name, referencedDocument] of Object.entries(referencedDocuments)) {
      if (referencedDocument === undefined) {
        continue;
      }

      if (referencedDocument === null) {
        throw new Error(
          `Type mismatch (field name: '${name})', expected: 'object', provided: 'null'`
        );
      }

      result[name] = mapFromOneOrMany(referencedDocument, referencedDocument => {
        if (typeof referencedDocument !== 'object') {
          throw new Error(
            `Type mismatch (field name: '${name})', expected: 'object', provided: '${typeof referencedDocument}'`
          );
        }

        return this.delete(referencedDocument);
      });
    }

    const document = this._collections[_type]?.[_id];
    if (document === undefined) {
      return result;
    }

    // Delete the specified document
    delete this._collections[_type][_id];

    return {_type, _id, ...result};
  }
}

function validateType(_type) {
  if (typeof _type !== 'string') {
    throw new Error(`'_type' must be a string (provided: ${typeof _type}`);
  }
  if (_type === '') {
    throw new Error(`'_type' cannot be empty`);
  }
}

function validateId(_id) {
  if (typeof _id !== 'string') {
    throw new Error(`'_id' must be a string (provided: ${typeof _id}`);
  }
  if (_id === '') {
    throw new Error(`'_id' cannot be empty`);
  }
}

function normalizeValue(value, {fieldName}) {
  if (value === null) {
    throw new Error(`The 'null' value is not allowed (field: '${fieldName}')`);
  }

  if (value === undefined || (typeof value === 'object' && value._type === 'undefined')) {
    return undefined;
  }

  return value;
}
