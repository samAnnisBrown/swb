/* eslint-disable no-await-in-loop */
/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License").
 *  You may not use this file except in compliance with the License.
 *  A copy of the License is located at
 *
 *  http://aws.amazon.com/apache2.0
 *
 *  or in the "license" file accompanying this file. This file is distributed
 *  on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 *  express or implied. See the License for the specific language governing
 *  permissions and limitations under the License.
 */

/**
 * This file contains a collection of functions that are used with the
 * applicationRoleEntity. Think of these functions as derived attributes
 * or functions that are part of the applicationRoleEntity.
 */

const _ = require('lodash');

const { StudyPolicy } = require('../../../../../helpers/iam/study-policy');
const { fsRoleIdCompositeKey } = require('../composite-keys');

function addStudy(fsRoleEntity = {}, studyEntity = {}) {
  const { id, folder, kmsArn, kmsScope, accessType } = studyEntity;
  fsRoleEntity.studies[id] = {
    folder,
    kmsArn,
    kmsScope,
    accessType,
    envPermission: studyEntity.envPermission,
  };

  return fsRoleEntity;
}

function hasStudy(fsRoleEntity = {}, studyEntity = {}) {
  const foundStudy = _.find(fsRoleEntity.studies, (study, id) => {
    const sameId = id === studyEntity.id;
    const sameRead = study.envPermission.read === studyEntity.envPermission.read;
    const sameWrite = study.envPermission.write === studyEntity.envPermission.write;

    return sameId && sameRead && sameWrite;
  });

  return !_.isUndefined(foundStudy);
}

function removeStudy(fsRoleEntity = {}, studyEntity = {}) {
  delete fsRoleEntity.studies[studyEntity.id];
}

function addMemberAccount(fsRoleEntity = {}, memberAccountId = '') {
  if (_.includes(fsRoleEntity.trust, memberAccountId)) return fsRoleEntity;
  fsRoleEntity.trust.push(memberAccountId);

  return fsRoleEntity;
}

function hasMemberAccount(fsRoleEntity = {}, memberAccountId) {
  return _.includes(fsRoleEntity.trust, memberAccountId);
}

function removeMemberAccount(fsRoleEntity = {}, memberAccountId = '') {
  _.remove(fsRoleEntity.trust, accountId => memberAccountId === accountId);
}

/**
 * Returns filesystem entity given its db entity version.
 *
 * @param dbEntity The db entity (a.k.a db record) to use to create the filesystem entity from
 */
function toFsRoleEntity(dbEntity) {
  if (!_.isObject(dbEntity)) return dbEntity;

  const entity = { ...dbEntity };
  const { accountId, arn } = fsRoleIdCompositeKey.decode(entity);
  entity.accountId = accountId;
  entity.arn = arn;
  delete entity.pk;
  delete entity.sk;

  return entity;
}

function toDbEntity(fsRoleEntity, by) {
  const dbEntity = { ...fsRoleEntity };
  delete dbEntity.accountId;

  if (_.isEmpty(by)) return dbEntity;

  dbEntity.updatedBy = by;

  if (_.isEmpty(dbEntity.createdBy)) {
    dbEntity.createdBy = by;
  }

  return dbEntity;
}

function newFsRoleEntity(appRoleEntity = {}) {
  const {
    accountId,
    boundaryPolicyArn,
    arn: appRoleArn,
    bucketKmsArn,
    mainRegion,
    bucketRegion,
    bucket,
    awsPartition,
    qualifier,
  } = appRoleEntity;
  const now = Date.now();
  const name = `${qualifier}-fs-${now}`;
  const arn = `arn:${awsPartition}:iam::${accountId}:role/${name}`;

  return {
    accountId,
    arn,
    name,
    qualifier,
    studies: {},
    appRoleArn,
    boundaryPolicyArn,
    bucket,
    bucketKmsArn,
    bucketRegion,
    mainRegion,
    awsPartition,
    trust: [], // This is where we store the member account ids. This property should be marked as a dynamodb set
  };
}

// vpcEpStudyMap Object structure: { VPCEndpoint1: [study1, study2,...], VPCEndpoint2: [study3], ... }
function toInlinePolicyDoc(fsRoleEntity = {}, vpcEpStudyMap = {}) {
  const { bucket, bucketKmsArn, awsPartition } = fsRoleEntity;
  const studyPolicy = new StudyPolicy();
  const studies = fsRoleEntity.studies || [];
  const studyIds = _.keys(studies);

  _.forEach(studyIds, studyId => {
    const study = studies[studyId];
    const { folder, kmsArn, kmsScope } = study;
    const item = {
      bucket,
      awsPartition,
      folder,
      permission: study.envPermission || { read: false, write: false },
      id: studyId, // Need to add the SWB study ID to parse normalized S3 prefix string later
    };

    if (kmsScope === 'bucket') {
      item.kmsArn = bucketKmsArn;
    } else if (kmsScope === 'study') {
      item.kmsArn = kmsArn;
    }

    studyPolicy.addStudy(item);
  });

  const vpcEpStatements = [];
  const createConditionForVpce = (vpce, currentStudyIds) => {
    const vpcEpStatement = {
      Condition: {
        StringNotEquals: {
          'aws:SourceVpce': vpce,
        },
        StringLike: {
          's3:prefix': _.map(currentStudyIds, studyId => {
            const prefix = _.get(_.find(studyPolicy.studies, { id: studyId }), 'prefix');
            // We need to account for the fact that a study might be the whole bucket, and when this
            // is the case, the s3:prefix entry should be "*" and not "/*"
            return prefix === '/' ? '*' : `${prefix}*`;
          }),
        },
      },
      Action: [
        's3:Get*',
        's3:List*',
        's3:Put*',
        's3:Delete*',
        's3:AbortMultipartUpload',
        's3:ListMultipartUploadParts',
      ],
      Resource: `arn:aws:s3:::${bucket}`,
      Effect: 'Deny',
      Sid: `AllowAccessFrom${vpce.split('-')[1]}`, // Managed Policy Sid cannot have anything but alphanumeric chars
    };
    vpcEpStatements.push(vpcEpStatement);
    return vpcEpStatements;
  };

  // For each unique VPC Endpoint, add a condition to limit their respective study access from that endpoint
  const vpcEndpoints = Object.keys(vpcEpStudyMap);
  _.forEach(vpcEndpoints, vpcEndpoint => createConditionForVpce(vpcEndpoint, vpcEpStudyMap[vpcEndpoint]));

  return studyPolicy.createPolicyDocAddStatements(vpcEpStatements);
}

function toTrustPolicyDoc(fsRoleEntity = {}) {
  return {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: {
          AWS: _.slice(fsRoleEntity.trust || []),
        },
        Action: ['sts:AssumeRole'],
      },
    ],
  };
}

// https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_iam-quotas.html
function maxReached(fsRoleEntity = {}, maxSize = 2 * 1024 - 255) {
  // The max characters count for a trust policy is 2k, we add some buffer here (255 character).

  const policyDoc = JSON.stringify(toTrustPolicyDoc(fsRoleEntity));
  return _.size(policyDoc) >= maxSize;
}

module.exports = {
  toFsRoleEntity,
  toDbEntity,
  newFsRoleEntity,
  addStudy,
  removeStudy,
  hasStudy,
  addMemberAccount,
  removeMemberAccount,
  hasMemberAccount,
  maxReached,
  toTrustPolicyDoc,
  toInlinePolicyDoc,
};
