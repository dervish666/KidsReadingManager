# Kids Reading Manager - Migration Rollback Plan

## Overview

This document outlines a comprehensive rollback plan for the Kids Reading Manager application migration from Node.js/Express with JSON file storage to Cloudflare Workers with KV storage. The plan provides detailed procedures to revert to the original architecture if critical issues are encountered during or after the migration.

## Rollback Decision Matrix

| Issue Category | Severity | Example | Rollback Decision |
|----------------|----------|---------|-------------------|
| **Functionality** | Critical | Core features not working | Immediate rollback |
| **Functionality** | High | Secondary features degraded | Assess fix timeline, rollback if >24h |
| **Functionality** | Medium | Minor UI issues | Fix forward, no rollback |
| **Performance** | Critical | Response times >10x baseline | Immediate rollback |
| **Performance** | High | Response times 2-10x baseline | Assess fix timeline, rollback if >24h |
| **Performance** | Medium | Response times <2x baseline | Fix forward, no rollback |
| **Data Integrity** | Critical | Data loss or corruption | Immediate rollback |
| **Data Integrity** | High | Inconsistent data state | Assess fix timeline, rollback if >12h |
| **Security** | Critical | Authentication bypass | Immediate rollback |
| **Security** | High | Potential data exposure | Immediate rollback |
| **Availability** | Critical | Service completely down | Immediate rollback |
| **Availability** | High | Intermittent outages | Assess fix timeline, rollback if >6h |

## Pre-Migration Preparations

To enable a smooth rollback if needed, the following preparations must be completed before migration:

### 1. System Backups

| Item | Backup Method | Storage Location | Retention Period |
|------|---------------|------------------|------------------|
| Application Code | Git repository snapshot | GitHub + Local backup | 90 days |
| Docker Images | Docker image export | Container registry + Local backup | 30 days |
| Application Data | Full JSON export | Secure cloud storage + Local backup | 30 days |
| Configuration Files | File backup | Secure cloud storage + Local backup | 30 days |
| Database Dumps | N/A (using file storage) | N/A | N/A |

### 2. DNS Configuration Backup

Document the current DNS configuration before making any changes:

```
# Current DNS Configuration
Domain: kids-reading-manager.example.com
Type: A
Value: [CURRENT_SERVER_IP]
TTL: 300
```

### 3. Infrastructure Documentation

Document the current infrastructure setup:

- Server specifications
- Network configuration
- Docker container configuration
- Volume mounts
- Environment variables

### 4. Verification of Current System

Before migration, verify that the current system is fully functional:

1. Run a full test suite against the current system
2. Verify all API endpoints are working correctly
3. Confirm data persistence is working
4. Document current performance metrics as a baseline

## Rollback Triggers

The following conditions would trigger consideration of a rollback:

1. **Critical functionality not working** in production
   - Student management features not working
   - Reading session tracking not working
   - Data import/export not working

2. **Significant performance degradation**
   - API response times more than 2x slower than baseline
   - Frontend rendering times more than 2x slower than baseline
   - Timeouts or failures under normal load

3. **Data integrity issues**
   - Data loss or corruption
   - Inconsistent data state
   - Failed data migration

4. **Security vulnerabilities**
   - Authentication or authorization issues
   - Data exposure risks
   - Other security concerns

5. **Availability issues**
   - Service outages
   - Frequent errors
   - Cloudflare service disruptions

## Rollback Procedures

### Phase 1: Decision and Communication

| Step | Description | Responsible | Estimated Time |
|------|-------------|-------------|----------------|
| 1.1 | Assess the issue and determine if rollback is necessary | Technical Lead | 15-30 minutes |
| 1.2 | Document the issue, including evidence and impact | Technical Lead | 15-30 minutes |
| 1.3 | Make rollback decision based on decision matrix | Project Manager & Technical Lead | 15 minutes |
| 1.4 | Notify all stakeholders of rollback decision | Project Manager | 15 minutes |
| 1.5 | Schedule rollback window if not immediate | Project Manager | 15 minutes |
| 1.6 | Prepare user communication | Support Team | 30 minutes |

### Phase 2: DNS Rollback

| Step | Description | Responsible | Estimated Time |
|------|-------------|-------------|----------------|
| 2.1 | Update DNS records to point back to original server | DevOps | 5 minutes |
| 2.2 | Reduce TTL to minimize propagation time | DevOps | 5 minutes |
| 2.3 | Verify DNS changes are propagating | DevOps | 15-60 minutes |
| 2.4 | Monitor traffic shift back to original server | DevOps | 30-60 minutes |

### Phase 3: Data Restoration (if needed)

| Step | Description | Responsible | Estimated Time |
|------|-------------|-------------|----------------|
| 3.1 | Assess if data restoration is needed | Technical Lead & Database Admin | 30 minutes |
| 3.2 | If needed, restore data from pre-migration backup | Database Admin | 30-60 minutes |
| 3.3 | If needed, import any new data created since migration | Database Admin | 30-60 minutes |
| 3.4 | Verify data integrity after restoration | QA Team | 30-60 minutes |

### Phase 4: Service Verification

| Step | Description | Responsible | Estimated Time |
|------|-------------|-------------|----------------|
| 4.1 | Verify original system is operational | QA Team | 30 minutes |
| 4.2 | Run critical path tests on original system | QA Team | 30 minutes |
| 4.3 | Verify data access and integrity | QA Team | 30 minutes |
| 4.4 | Check system performance | QA Team | 15 minutes |

### Phase 5: User Communication

| Step | Description | Responsible | Estimated Time |
|------|-------------|-------------|----------------|
| 5.1 | Notify users that rollback is complete | Support Team | 15 minutes |
| 5.2 | Provide guidance on any actions users need to take | Support Team | 30 minutes |
| 5.3 | Set up monitoring for user-reported issues | Support Team | 15 minutes |

### Phase 6: Post-Rollback Analysis

| Step | Description | Responsible | Estimated Time |
|------|-------------|-------------|----------------|
| 6.1 | Document the rollback process and any issues encountered | Technical Lead | 1-2 hours |
| 6.2 | Analyze root cause of migration issues | Technical Team | 4-8 hours |
| 6.3 | Develop remediation plan for future migration attempt | Technical Team | 4-8 hours |
| 6.4 | Schedule post-mortem meeting | Project Manager | 30 minutes |

## Detailed Rollback Procedures

### DNS Rollback Procedure

```bash
# Example commands for updating DNS records
# Using Cloudflare API

# Set API token and zone ID
export CLOUDFLARE_API_TOKEN="your-api-token"
export CLOUDFLARE_ZONE_ID="your-zone-id"

# Get current DNS record ID
RECORD_ID=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/dns_records?name=kids-reading-manager.example.com" \
     -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
     -H "Content-Type: application/json" | jq -r '.result[0].id')

# Update DNS record to point back to original server
curl -X PATCH "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/dns_records/$RECORD_ID" \
     -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
     -H "Content-Type: application/json" \
     --data '{"content":"ORIGINAL_SERVER_IP","ttl":60}'

# Verify the change
curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/dns_records/$RECORD_ID" \
     -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
     -H "Content-Type: application/json" | jq
```

### Data Restoration Procedure

```bash
# Example commands for restoring data

# 1. Stop the application to prevent writes during restoration
docker-compose stop app

# 2. Backup the current data file (just in case)
cp /config/app_data.json /config/app_data.json.migration_backup

# 3. Restore the pre-migration backup
cp /backups/pre_migration_app_data.json /config/app_data.json

# 4. Restart the application
docker-compose start app

# 5. Verify data integrity
curl -s http://localhost:3000/api/students | jq length
```

### Handling Data Created During Migration

If new data was created during the migration period, it will need to be merged back into the original system. This can be done using the following procedure:

1. Export all data from the Cloudflare KV storage:

```bash
# Using wrangler to export KV data
wrangler kv:key get --binding=READING_MANAGER_KV "app_data" > cloudflare_app_data.json
```

2. Identify new or modified records:

```javascript
// Node.js script to identify new/modified records
const fs = require('fs');

// Load data
const originalData = JSON.parse(fs.readFileSync('/config/app_data.json', 'utf8'));
const cloudflareData = JSON.parse(fs.readFileSync('cloudflare_app_data.json', 'utf8'));

// Find new students
const originalStudentIds = new Set(originalData.students.map(s => s.id));
const newStudents = cloudflareData.students.filter(s => !originalStudentIds.has(s.id));

console.log(`Found ${newStudents.length} new students to import`);

// Find modified students (by comparing lastUpdated timestamps if available)
// This is a simplified example - actual implementation would need more sophisticated comparison
const modifiedStudents = cloudflareData.students.filter(cfStudent => {
  const originalStudent = originalData.students.find(s => s.id === cfStudent.id);
  if (!originalStudent) return false;
  
  // Compare by number of reading sessions as a simple heuristic
  return cfStudent.readingSessions.length > originalStudent.readingSessions.length;
});

console.log(`Found ${modifiedStudents.length} modified students to update`);

// Write new and modified students to files for import
fs.writeFileSync('new_students.json', JSON.stringify(newStudents, null, 2));
fs.writeFileSync('modified_students.json', JSON.stringify(modifiedStudents, null, 2));
```

3. Import the new data into the original system:

```bash
# Import new students via API
curl -X POST http://localhost:3000/api/students/bulk \
  -H "Content-Type: application/json" \
  -d @new_students.json

# Update modified students one by one
for student in $(jq -c '.[]' modified_students.json); do
  id=$(echo $student | jq -r '.id')
  echo "Updating student $id"
  curl -X PUT http://localhost:3000/api/students/$id \
    -H "Content-Type: application/json" \
    -d "$student"
done
```

## Testing the Rollback

Before the migration, a rollback test should be conducted to ensure the rollback procedures work as expected. This test should include:

1. **DNS Rollback Test**: Verify that DNS changes propagate correctly
2. **Data Restoration Test**: Verify that data can be restored from backups
3. **Application Functionality Test**: Verify that the application works correctly after rollback
4. **Performance Test**: Verify that performance returns to baseline after rollback

## Monitoring During Rollback

During the rollback process, the following metrics should be monitored:

1. **DNS Propagation**: Monitor DNS resolution to ensure traffic is routing correctly
2. **Application Availability**: Monitor application uptime and error rates
3. **API Response Times**: Monitor API performance during and after rollback
4. **User Activity**: Monitor user logins and core feature usage
5. **Error Rates**: Monitor application errors and exceptions

## Post-Rollback Activities

After a successful rollback, the following activities should be completed:

1. **Root Cause Analysis**: Determine what went wrong with the migration
2. **Fix Identification**: Identify fixes for the issues encountered
3. **Migration Plan Update**: Update the migration plan to address the issues
4. **Rollback Plan Update**: Update the rollback plan based on lessons learned
5. **Stakeholder Communication**: Provide a detailed report to stakeholders
6. **Reschedule Migration**: Plan for a new migration attempt with fixes in place

## Rollback Success Criteria

The rollback will be considered successful when:

1. The application is fully functional on the original architecture
2. All data is intact and accessible
3. Performance has returned to baseline levels
4. Users can access all features without issues
5. No new issues have been introduced by the rollback

## Roles and Responsibilities

| Role | Responsibilities |
|------|------------------|
| **Project Manager** | Overall coordination, stakeholder communication, decision making |
| **Technical Lead** | Technical assessment, rollback procedure oversight, root cause analysis |
| **DevOps Engineer** | DNS changes, server configuration, monitoring |
| **Database Administrator** | Data backup and restoration, data integrity verification |
| **QA Team** | Testing and verification before, during, and after rollback |
| **Support Team** | User communication, issue tracking, user guidance |
| **Development Team** | Technical support, issue investigation, fix development |

## Communication Plan

| Audience | Communication Method | Timing | Message Content |
|----------|---------------------|--------|----------------|
| **Internal Team** | Slack/Teams channel | Immediately upon decision | Rollback decision, timeline, responsibilities |
| **Management** | Email + Meeting | Within 1 hour of decision | Rollback decision, business impact, timeline |
| **End Users** | Application notification + Email | Before rollback starts | Service interruption notice, expected duration |
| **End Users** | Application notification + Email | After rollback completes | Service restoration notice, any required actions |
| **All Stakeholders** | Email | Within 24 hours after rollback | Summary of events, next steps, lessons learned |

## Rollback Timeline Example

| Time | Activity |
|------|----------|
| T+0:00 | Issue detected in production |
| T+0:30 | Initial assessment completed |
| T+0:45 | Rollback decision made |
| T+1:00 | Stakeholders notified |
| T+1:15 | DNS changes initiated |
| T+1:30 | User communication sent |
| T+2:00 | DNS propagation complete |
| T+2:30 | Data restoration (if needed) |
| T+3:00 | Service verification complete |
| T+3:15 | Rollback completion notification sent |
| T+4:00 | Initial post-rollback analysis |
| T+24:00 | Detailed root cause analysis and remediation plan |

## Conclusion

This rollback plan provides a comprehensive framework for reverting the Kids Reading Manager application from Cloudflare Workers back to the original Node.js/Express architecture if necessary. By following this plan, the team can minimize disruption to users and quickly restore service in the event of critical issues during or after migration.

The plan emphasizes preparation, clear decision-making criteria, detailed procedures, and effective communication to ensure a smooth rollback process. Regular testing and updates to this plan will help maintain its effectiveness over time.