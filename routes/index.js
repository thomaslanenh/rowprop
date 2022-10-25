var express = require('express');
var router = express.Router();
const readXlsxFile = require('read-excel-file/node');
const fs = require("fs");
const multer  = require('multer')
const {diskStorage} = require("multer");
var path = require('path');

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
  res.render('index', { title: 'PropsRow' });
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

  readXlsxFile(fs.createReadStream(req.file.path), {schema}).then(async ({rows, errors}) => {
      for (const row of rows) {

          let propertyGroupLabel = row.groupName;
          let propertyGroupName = propertyGroupLabel.replace(/\W+/g, '_').toLowerCase();
          let groupFound = null;

          try {
              // Look at the groups
              const getGroups = await fetch(`https://api.hubspot.com/crm/v3/properties/${row.objectType}/groups`, {
                  headers: {
                      "Authorization": `Bearer ${req.body.token}`
                  }
              });

              const body = await getGroups.json();

              console.log(body);

              if (body.results.find(element => element.name === propertyGroupName)) {
                groupFound = true;
                res.send({
                    found: "GroupName found."
                })
                  // write logic to create properties
              } else {

                  var groupData = JSON.stringify({
                      "name": propertyGroupName,
                      "label": propertyGroupLabel
                  });

                  const createGroup = await fetch(`https://api.hubspot.com/crm/v3/properties/${row.objectType}/groups`, {
                      method: "POST",
                      headers: {"Authorization": `Bearer ${req.body.token}`, "Content-Type": "application/json"},
                      body: groupData
                  });


                  if (createGroup.status != 400) {
                      // create succesful, start propertie makes

                      res.send({found: true, created: true})
                  } else {
                      // create error, send alert
                      res.status(400).send({error: "An error has occured creating group names. Check the Group Name to ensure no illegal characters such as $!^@% etc."})
                  }
              }
          } catch (e) {
              console.log(e);

              res.send({message: "error", error: e})
          }
      }
  })

})

module.exports = router;
