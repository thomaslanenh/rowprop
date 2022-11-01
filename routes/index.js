var express = require('express');
var router = express.Router();
const readXlsxFile = require('read-excel-file/node');
const fs = require("fs");
const multer  = require('multer')
const {diskStorage} = require("multer");
var path = require('path');
var axios = require('axios');

var storage = multer.diskStorage({
    destination: function (req,res,cb){
        cb(null, 'docs')
    },
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname))
    }
})

var upload = multer({ storage: storage })

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'The Importer' });
});

router.post('/submit-sheet',upload.single('spreadsheet'), async(req,res,next)=>{

  const schema = {
    'Label': {
      prop: 'label',
      type: String,
        required: true
    },
    'Type': {
      prop: 'type',
      type: String,
      oneOf: [
          'string',
          'number',
          'bool',
          'date',
          'dateTime',
          'datetime',
          'enumeration'
      ],
        required: true
    },
    'Field Type': {
      prop: "fieldType",
      type: String,
      oneOf: [
          'file',
          'text',
          'textarea',
          'calculation_equation',
          'html',
          'number',
          'booleancheckbox',
          'date',
          'checkbox',
          'radio',
          'select'
      ],
        required: true
    },
    'Group Name': {
      prop: 'groupName',
      type: String,
        required: true
    },
    'Object Type': {
      prop: 'objectType',
      type: String,
        required: true
    },
    'Synced': {
      prop: 'isSynced',
      type: Boolean,
        required: true
    }
  }

  let groupNameStorage = [];
  let existingGroups = [];
  let results = {
      propertiesSkipped : [],
        propertiesAdded : []
  }


  const initGroups = async (groups) => {

      if (existingGroups.find(e => e === groups.name.toString())) {
          console.log('Group ' + groups.name + ' found in already parsed list');
          return true;
      } else {
          console.log('group: ' + groups.name + ' not found as already parsed, searching in HS')
          let propertyGroupLabel = groups.name;
          let propertyGroupName = groups.name.replace(/\W+/g, '_').toLowerCase();
          console.log('send in group name: ' + propertyGroupName);

          try {
              // see if group exists via API call


              var config = {
                  method: 'get',
                  url: `https://api.hubspot.com/crm/v3/properties/${groups.object}/groups`,
                  headers: {
                      'Authorization': `Bearer ${req.body.token}`,
                      'Content-Type': 'application/json',
                  }
              };

              const getGroups = await axios(config);

              // see if group was found
              if (getGroups.data.results.find(element => element.name === propertyGroupName)) {
                  console.log('group found in hubspot: ' + groups.name)
                  existingGroups.push(groups.name.toString())
                  return existingGroups;
              } else {

                  console.log('group not found in HubSpot, attempting to create');

                  var groupData = JSON.stringify({
                      "name": propertyGroupName,
                      "label": propertyGroupLabel
                  });

                  var config2 = {
                      method: 'post',
                      url: `https://api.hubspot.com/crm/v3/properties/${groups.object}/groups`,
                      headers: {
                          'Authorization': `Bearer ${req.body.token}`,
                          'Content-Type': 'application/json',
                      },
                      data: groupData
                  };

                  const createGroup = await axios(config2);

                  console.log(createGroup.status);
                  if (createGroup.status === 201) {
                      // create succesful, start propertie makes
                      existingGroups.push(groups.name.toString());
                     return existingGroups;
                  } else {
                      // create error, send alert
                      throw "An error has occurred creating group names. Check that the Group Name has no illegal characters in it.";

                  }
              }

          } catch (e) {
              console.log('error: ' + e.error.status)
              if (e.error.status === 403){
                  res.status(400).send({error: "An error has occurred. Make sure your token has all the necessary scopes required."})
              }else {
                  res.status(400).send({error: e})
              }
          }
      }
  }

  const getEnumOptions = async (propertyLabel) => {
      let map = {
          "Property": 'property',
          "Description": 'description',
          "Label": 'label',
          "Value": 'value'
      }

      let options = await readXlsxFile(fs.createReadStream(req.file.path), {map, sheet: 3}).then(async (data) => {
          let newObj = []
          for (const enu of data.rows) {

              if (enu.property === propertyLabel) {
                  newObj.push({
                      "label": `${enu.label}`,
                      "description": `${enu.description}`,
                      "value": `${enu.value}`
                  })

              }

          }
          return newObj;
      })
      console.log('options is: ' + options)

      return options;
  }

  readXlsxFile(fs.createReadStream(req.file.path), {schema, sheet: 1}).then(async ({rows, errors}) => {

      for (const row of rows){
          groupNameStorage.push({name: row.groupName, object: row.objectType})
      };

      for (const group of groupNameStorage){
          await initGroups(group);
      }

      console.log('row length: ' + rows.length)

      for (const row of rows) {

          let propertyLabel = row.label;
          let propertyName = propertyLabel.replace(/\W+/g, '_').toLowerCase();
          let propertyFieldType = row.fieldType;
          let propertyType = row.type;
          let objectType = row.objectType;
          let propertyGroupName = row.groupName.replace(/\W+/g, '_').toLowerCase();

          try {
              console.log('Property Create Process Started For: ' + propertyLabel);


              if (propertyType === "enumeration"){
                  console.log('setting up enum');

                let options = await getEnumOptions(propertyLabel);

                console.log('test run: ' + options);
                  var groupDataEnum = JSON.stringify({
                      "name": propertyName,
                      "label": propertyLabel,
                      "groupName": propertyGroupName,
                      "type": propertyType,
                      "fieldType": propertyFieldType,
                      "options": await getEnumOptions(propertyLabel)
                  });


                  const config3 = {
                      method: 'post',
                      url: `https://api.hubspot.com/crm/v3/properties/${objectType}`,
                      headers: {
                          'Authorization': `Bearer ${req.body.token}`,
                          'Content-Type': 'application/json',
                      },
                      data: groupDataEnum
                  };

                  const createProperty = await axios(config3);

                  if (createProperty.status === 201){
                      console.log('Creation success.');
                      results.propertiesAdded.push({property: propertyLabel, createdName: propertyName, group: propertyGroupName, type: propertyType, fieldtype: propertyFieldType });
                  }


              }
              else {
                  var groupData2 = JSON.stringify({
                      "name": propertyName,
                      "label": propertyLabel,
                      "groupName": propertyGroupName,
                      "type": propertyType,
                      "fieldType": propertyFieldType
                  });

                  const config3 = {
                      method: 'post',
                      url: `https://api.hubspot.com/crm/v3/properties/${objectType}`,
                      headers: {
                          'Authorization': `Bearer ${req.body.token}`,
                          'Content-Type': 'application/json',
                      },
                      data: groupData2
                  };

                  const createProperty = await axios(config3);

                  if (createProperty.status === 201){
                      console.log('Creation success.');
                      results.propertiesAdded.push({property: propertyLabel, createdName: propertyName, group: propertyGroupName, type: propertyType, fieldtype: propertyFieldType });
                  }
              }



          }catch(e){
              console.log(e.response.data.message)
              results.propertiesSkipped.push({property: propertyLabel, reason: e.response.data.message});
          }
      }
  }).then((e)=>{
      fs.unlinkSync(req.file.path);

      res.status(200).send({message: 'Properties Successfully Created (Or Skipped if Existing)',
        skipped: results.propertiesSkipped, created: results.propertiesAdded})
  })
  .catch((e)=>{
      console.log(e)
      res.status(400).send({
          error: e
      })
  })

})

module.exports = router;
