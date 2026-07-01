#!/bin/bash
# Overnight NEW-BATCH: run fresh queue searches through the full pipeline (locked video code).
# Per-search watchdog; marks queue done; new leads suppressed for morning review.
cd "/Users/chris/RGA/Rocket Growth Agency Scraper VS Code" || exit 1
RESULTS=/tmp/new-batch-results.txt; : > "$RESULTS"
ML="/tmp/new-batch-master.log"
PER_SEARCH_SECS=7200   # 2h hard cap per search
log(){ echo "[$(date '+%m-%d %H:%M:%S')] $*" | tee -a "$ML"; }
log "NEW BATCH start"
while IFS='|' read -r RECID QUERY; do
  [ -z "$QUERY" ] && continue
  log "SEARCH: $QUERY (rec $RECID)"
  SLOG="/tmp/search-$RECID.log"
  caffeinate -dimsu bash scripts/overnight-pipeline.sh "$QUERY" > "$SLOG" 2>&1 &
  PID=$!
  waited=0; TO=0
  while kill -0 "$PID" 2>/dev/null; do
    sleep 30; waited=$((waited+30))
    if [ "$waited" -ge "$PER_SEARCH_SECS" ]; then
      log "TIMEOUT ${PER_SEARCH_SECS}s — killing $QUERY"
      pkill -P "$PID" 2>/dev/null; kill "$PID" 2>/dev/null; pkill -f "node step-" 2>/dev/null; TO=1; sleep 3; break
    fi
  done
  wait "$PID" 2>/dev/null
  pkill -f "node step-" 2>/dev/null; sleep 1
  DEPLOYED=$(grep -c "DONE —" "$SLOG" 2>/dev/null || echo 0)
  echo "$([ "$TO" -eq 1 ] && echo TIMEOUT || echo DONE)|$QUERY|deployed=$DEPLOYED" >> "$RESULTS"
  log "  -> $([ "$TO" -eq 1 ] && echo TIMEOUT || echo DONE) ($DEPLOYED deployed)"
  # mark queue record done
  node -e '
  require("dotenv").config();const K=process.env.AIRTABLE_API_KEY,B=process.env.AIRTABLE_BASE_ID;
  (async()=>{await fetch(`https://api.airtable.com/v0/${B}/Search%20Queue/'"$RECID"'`,{method:"PATCH",headers:{Authorization:"Bearer "+K,"Content-Type":"application/json"},body:JSON.stringify({fields:{Status:"done"}})});})();
  ' >/dev/null 2>&1
done < /tmp/new-batch-searches.txt
log "all searches done — suppressing new leads (hold for review)"
# Suppress every lead scraped today that has NOT been sent (hold new batch for Chris's review)
node -e '
require("dotenv").config();const K=process.env.AIRTABLE_API_KEY,B=process.env.AIRTABLE_BASE_ID;
const today=new Date().toISOString().slice(0,10);
(async()=>{let recs=[],offset;do{const u=new URL(`https://api.airtable.com/v0/${B}/Leads`);u.searchParams.set("pageSize","100");["Business Name","Date Scraped","Email Sent Date","Suppressed"].forEach(f=>u.searchParams.append("fields[]",f));if(offset)u.searchParams.set("offset",offset);const r=await fetch(u,{headers:{Authorization:"Bearer "+K}});const j=await r.json();recs=recs.concat(j.records||[]);offset=j.offset;}while(offset);
const fresh=recs.filter(x=>{const ds=(x.fields["Date Scraped"]||"").slice(0,10);return ds>=today && !x.fields["Email Sent Date"] && x.fields.Suppressed!==true;});
console.log("suppressing",fresh.length,"new leads for review");
for(let i=0;i<fresh.length;i+=10){const batch=fresh.slice(i,i+10);await fetch(`https://api.airtable.com/v0/${B}/Leads`,{method:"PATCH",headers:{Authorization:"Bearer "+K,"Content-Type":"application/json"},body:JSON.stringify({records:batch.map(x=>({id:x.id,fields:{Suppressed:true}}))})});}
console.log("done suppressing");
})();
' 2>&1 | grep -v dotenv | tee -a "$ML"
log "NEW BATCH COMPLETE"
echo "NEW-BATCH-COMPLETE-MARKER" >> "$ML"
