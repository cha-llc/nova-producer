/**
 * book-editor v5 — draft_save: DB+Drive autosave; rewrite prompt fixes (no header in output)
 */
import{createClient}from'https://esm.sh/@supabase/supabase-js@2'
const SB_URL=Deno.env.get('SUPABASE_URL')!;const SB_SVC=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;const sb=createClient(SB_URL,SB_SVC)
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'}
const j=(d:unknown,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{...CORS,'Content-Type':'application/json'}})
async function fromVault(fn:string):Promise<string|null>{try{const{data}=await sb.rpc(fn);if(data&&String(data).length>8)return String(data).trim()}catch{}return null}
function fromEnv(...n:string[]):string|null{for(const k of n){const v=Deno.env.get(k)?.trim();if(v&&v.length>4)return v}return null}
async function getKey(vfn:string,...env:string[]):Promise<string|null>{return await fromVault(vfn)||fromEnv(...env)}
const keys={
  anthropic:()=>getKey('vault_read_anthropic_key','ANTHROPIC_API_KEY'),
  fal:()=>getKey('vault_read_fal_key','FAL_KEY','FAL_API_KEY','fal_api_key'),
  slack:()=>Promise.resolve(fromEnv('SLACK_BOT_TOKEN','SLACK_TOKEN')),
  hubspot:()=>Promise.resolve(fromEnv('HUBSPOT_TOKEN','HUBSPOT_API_KEY','HUBSPOT_PRIVATE_APP_TOKEN')),
  elevenlabs:()=>getKey('vault_read_elevenlabs_key','ELEVENLABS_API_KEY'),
  heygen:()=>getKey('vault_read_heygen_key','HEYGEN_API_KEY'),
  canva_id:()=>getKey('vault_read_canva_id','CANVA_CLIENT_ID'),
  pinterest:()=>getKey('vault_read_pinterest_key','PINTEREST_API_TOKEN'),
}

async function ai(messages:{role:string;content:string}[],max=4000,sys=''):Promise<string>{
  const k=await keys.anthropic();if(!k)throw new Error('Anthropic key not found')
  const b:Record<string,unknown>={model:'claude-sonnet-4-5',max_tokens:max,messages}
  if(sys)b.system=sys
  const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':k,'anthropic-version':'2023-06-01','content-type':'application/json'},body:JSON.stringify(b)})
  if(!r.ok){const e=await r.text();throw new Error('Anthropic '+r.status+': '+e.slice(0,200))}
  const d=await r.json()
  return(d.content?.find((b:{type:string})=>b.type==='text')?.text||'').trim()
}

async function callFal(model:string,prompt:string,sz='portrait_4_3'):Promise<string[]>{
  const k=await keys.fal();if(!k)throw new Error('fal key not found')
  const fast=!model.includes('dev')&&!model.includes('gpt-image')
  if(fast){const r=await fetch('https://fal.run/'+model,{method:'POST',headers:{Authorization:'Key '+k,'Content-Type':'application/json'},body:JSON.stringify({prompt,image_size:sz,num_images:1})});const d=await r.json();return(d.images||[]).map((i:{url:string})=>i.url)}
  const qr=await fetch('https://queue.fal.run/'+model,{method:'POST',headers:{Authorization:'Key '+k,'Content-Type':'application/json'},body:JSON.stringify({prompt,image_size:sz,num_images:1})})
  const q=await qr.json();const rid=q.request_id;if(!rid)throw new Error('fal queue failed')
  for(let i=0;i<25;i++){await new Promise(r=>setTimeout(r,2000));const sr=await fetch('https://queue.fal.run/'+model+'/requests/'+rid,{headers:{Authorization:'Key '+k}});const s=await sr.json();if(s.status==='COMPLETED')return(s.output?.images||s.images||[]).map((i:{url:string})=>i.url);if(s.status==='FAILED')throw new Error('fal failed')}
  throw new Error('fal timeout')
}

async function slackPost(ch:string,txt:string){
  const k=await keys.slack();if(!k)return
  await fetch('https://slack.com/api/chat.postMessage',{method:'POST',headers:{Authorization:'Bearer '+k,'Content-Type':'application/json'},body:JSON.stringify({channel:ch,text:txt})}).catch(()=>{})
}

async function hubspotCreate(title:string,author:string,words:number,score:number):Promise<string|null>{
  const k=await keys.hubspot();if(!k)return null
  try{const r=await fetch('https://api.hubapi.com/crm/v3/objects/deals',{method:'POST',headers:{Authorization:'Bearer '+k,'Content-Type':'application/json'},body:JSON.stringify({properties:{dealname:'\uD83D\uDCDA Book: '+title,dealstage:'closedwon',amount:'0',closedate:new Date().toISOString().split('T')[0],description:'Author: '+author+' | '+words.toLocaleString()+' words | Score: '+score+'/10',pipeline:'default'}})});const d=await r.json();return d.id||null}catch{return null}
}

async function saveToDrive(title:string,author:string,html:string):Promise<string>{
  const r=await fetch(SB_URL+'/functions/v1/nova-drive-upload',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+SB_SVC},body:JSON.stringify({fileName:title+' \u2014 '+author+' (KDP).html',content:html,mimeType:'text/html',parentId:'1P-UETwfy0b4hZMvsALOsdasPIBQFECxV'})})
  const d=await r.json()
  return d.webViewLink||'https://drive.google.com/drive/folders/1P-UETwfy0b4hZMvsALOsdasPIBQFECxV'
}

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response(null,{headers:CORS})
  if(req.method!=='POST')return j({error:'POST only'},405)
  let body:Record<string,unknown>
  try{body=await req.json()}catch{return j({error:'Invalid JSON'},400)}
  const action=body.action as string
  try{

  if(action==='ping'){
    const[an,fl,sl,hs,el,hg,cv,pi]=await Promise.all([keys.anthropic(),keys.fal(),keys.slack(),keys.hubspot(),keys.elevenlabs(),keys.heygen(),keys.canva_id(),keys.pinterest()])
    return j({connected:{anthropic:!!an,fal_ai:!!fl,slack:!!sl,hubspot:!!hs,elevenlabs:!!el,heygen:!!hg,canva:!!cv,pinterest:!!pi,google_drive:true,supabase:true}})
  }

  if(action==='claude'){const t=await ai(body.messages as{role:string;content:string}[],(body.max_tokens as number)||4000,(body.system as string)||'');return j({content:[{type:'text',text:t}]})}

  if(action==='cover'){const urls=await callFal((body.model as string)||'fal-ai/flux/schnell',body.prompt as string,(body.image_size as string)||'portrait_4_3');return j({images:urls.map(u=>({url:u}))})}

  if(action==='analyze'){
    const prompt='Developmental editor. Analyze Chapter '+body.number+': "'+body.title+'".\nReturn ONLY valid JSON:\n{"pacing":"fast/slow/good","issues":["issue"],"strengths":["strength"],"rewrite_instructions":"2-3 specific directives","opening_hook":"weak/strong","dialogue_quality":"none/weak/strong","showing_vs_telling":"mostly telling/balanced/mostly showing"}\nCHAPTER:\n'+(body.chapter as string).slice(0,5000)
    const raw=await ai([{role:'user',content:prompt}],800,'Professional '+body.genre+' developmental editor.')
    return j({analysis:raw})
  }

  if(action==='rewrite'){
    const mode=body.edit_mode as string
    const modeInstr=mode==='light'?'Light edit: fix grammar, word choice, passive voice. Preserve structure. Keep similar length.':mode==='deep'?'Deep edit: restructure scenes, strengthen pacing, deepen character voice. 1.5x length.':'Oprah Book Club full rewrite. Expand, dramatise, vivid dialogue and sensory detail. Min 3x words if under 1000w.'
    const voiceNote=body.voice_context?'\n\nAUTHOR VOICE:\n'+(body.voice_context as string):''
    const sys='World-class '+(body.genre as string)+' editor. '+modeInstr+voiceNote+'\nIMPORTANT: Output ONLY the rewritten prose. Do NOT include any chapter heading, title, number, or label at the start.'
    const parts:string[]=[]
    if(body.prev_summary)parts.push('CONTEXT FROM PREVIOUS CHAPTER:\n'+body.prev_summary)
    if(body.bible_context)parts.push(String(body.bible_context))
    if(body.analysis_instructions)parts.push('EDITOR NOTES — FIX THESE:\n'+body.analysis_instructions)
    if(Number(body.section_total)>1)parts.push('Section '+body.section_number+'/'+body.section_total+' of chapter. Plain prose only, no heading.')
    parts.push('ORIGINAL TEXT:\n'+(body.chapter_text as string))
    const prose=await ai([{role:'user',content:parts.join('\n\n')}],8000,sys)
    return j({text:prose})
  }

  if(action==='rewrite_v2'){
    const voiceNote=body.voice_context?'\n\nAUTHOR VOICE PROFILE:\n'+(body.voice_context as string):''
    const sys='Voice-matching specialist. ONLY job: make this prose sound like the author. Focus 100% on sentence rhythm, vocabulary, POV consistency, dialogue patterns, descriptive style. Do NOT change plot or events. Output ONLY the voice-matched prose.'+voiceNote
    const prose=await ai([{role:'user',content:'Match author voice. Output ONLY prose.\n'+(body.chapter_text as string)}],8000,sys)
    return j({text:prose})
  }

  if(action==='score'){
    const raw=await ai([{role:'user',content:'Rate this '+body.genre+' excerpt.\nReturn ONLY valid JSON:\n{"score":8,"feedback":"2 editorial sentences","new_title":"improved title","alt_titles":["a","b","c"],"summary":"1-sentence chapter summary"}\nEXCERPT:\n'+(body.excerpt as string).slice(0,400)}],400)
    return j({raw})
  }

  if(action==='extract_bible'){
    const raw=await ai([{role:'user',content:'Extract Book Bible. Return ONLY valid JSON:\n{"characters":[{"name":"","role":"","appearance":"","personality":"","arc":""}],"locations":[{"name":"","description":"","atmosphere":""}],"themes":[""],"timeline":"","writingStyle":"","plotSummary":"","tone":"","centralConflict":""}\nMANUSCRIPT:\n'+(body.manuscript as string).slice(0,10000)}],2500,'Professional story analyst.')
    return j({raw})
  }

  if(action==='marketing'){
    const raw=await ai([{role:'user',content:'KDP marketing for "'+body.title+'" by '+body.author+' ('+body.genre+', '+body.words+'w).\nReturn ONLY valid JSON:\n{"blurb":"150w","tagline":"10 words","keywords":["k1","k2","k3","k4","k5","k6","k7"],"bisac":["cat"],"audience":"2 sentences","backCover":"full back cover","aplus":"A+ 3 sections","socialPosts":{"tiktok":"","instagram":"","twitter":"","linkedin":"","pinterest":""}}\nSYNOPSIS:\n'+body.synopsis}],3500,'KDP marketing expert.')
    return j({raw})
  }

  if(action==='consistency'){
    const raw=await ai([{role:'user',content:'Continuity editor. Find SPECIFIC inconsistencies.\nReturn ONLY valid JSON or []:\n[{"type":"character|timeline|setting|plot","chapter1":1,"chapter2":3,"issue":"description","severity":"minor|major","suggestion":"fix"}]\nBOOK BIBLE:\n'+body.bible+'\nCHAPTER SUMMARIES:\n'+body.chapter_summaries}],2000)
    return j({raw})
  }

  if(action==='expand'){const prose=await ai([{role:'user',content:'EXPAND this sparse passage into a fully realised scene. 3-4x word count. Output ONLY expanded prose.\n'+(body.text as string)}],4000,'Expert '+(body.genre as string)+' editor.');return j({text:prose})}
  if(action==='describe'){const prose=await ai([{role:'user',content:'Add rich sensory detail (sight, sound, smell, touch, taste). Weave naturally. Output the enhanced passage only.\n'+(body.text as string)}],3000);return j({text:prose})}
  if(action==='dialogue'){const prose=await ai([{role:'user',content:'Make this dialogue crackle — distinct voices, subtext, conflict, natural rhythm. Output ONLY the enhanced passage.\n'+(body.text as string)}],3000);return j({text:prose})}

  if(action==='alternatives'){
    const genre=body.genre as string
    const sys='World-class '+genre+' editor. Output ONLY clean prose. No labels, no headings, no "Alternative N" prefix. Start directly with the story.'
    const txt=(body.chapter_text as string).slice(0,3000)
    const[a,b2,c]=await Promise.all([
      ai([{role:'user',content:'Rewrite in CINEMATIC style: heavy action beats, short punchy sentences, scene cuts. Output ONLY prose.\n'+txt}],6000,sys),
      ai([{role:'user',content:'Rewrite in LITERARY style: deep interiority, lyrical prose, metaphor and symbolism. Output ONLY prose.\n'+txt}],6000,sys),
      ai([{role:'user',content:'Rewrite in COMMERCIAL FICTION style: page-turning hooks, propulsive dialogue, strong chapter ending. Output ONLY prose.\n'+txt}],6000,sys),
    ])
    return j({alternatives:[a,b2,c]})
  }

  if(action==='weak_words'){
    const raw=await ai([{role:'user',content:'Professional copy editor. Scan this text.\nReturn ONLY valid JSON:\n{"passive_voice":["example sentence"],"filter_words":["he saw/felt/heard examples"],"cliches":["cliche"],"weak_adverbs":["adverb+verb"],"repeated_words":[{"word":"very","count":3}],"overwrite_score":7,"summary":"2-sentence assessment","top_fix":"single most impactful improvement"}\nTEXT:\n'+(body.text as string).slice(0,4000)}],1200,'Professional copy editor for commercial fiction.')
    return j({raw})
  }

  if(action==='plot_arc'){
    const summaries=(body.summaries as string[]).map((s:string,i:number)=>'Ch '+(i+1)+': '+s).join('\n')
    const raw=await ai([{role:'user',content:'Map chapters to 3-act structure.\nReturn ONLY valid JSON:\n{"act1":{"chapters":[1,2,3],"label":"Setup","key_beat":"inciting incident"},"act2a":{"chapters":[4,5,6],"label":"Rising Action","key_beat":""},"midpoint":{"chapter":7,"label":"Midpoint","description":""},"act2b":{"chapters":[8,9,10],"label":"Dark Night","key_beat":""},"act3":{"chapters":[11,12],"label":"Resolution","key_beat":""},"overall_structure":"3-act","pacing_note":"assessment"}\nCHAPTER SUMMARIES:\n'+summaries}],1000)
    return j({raw})
  }

  if(action==='full_analysis'){
    const chaps=body.chapters as{number:number;title:string;text:string}[]
    const synopsis=chaps.map(c=>'Ch '+c.number+' ('+c.title+'): '+c.text.slice(0,400)).join('\n')
    const sample=chaps.slice(0,5).map(c=>c.text.slice(0,800)).join('\n\n')
    const raw=await ai([{role:'user',content:'Comprehensive manuscript analysis for '+body.genre+' novel.\nReturn ONLY valid JSON:\n{"pov_issues":[{"chapter":1,"issue":"description"}],"tense_shifts":[{"chapter":1,"example":"shifted from past to present here"}],"sentence_variety_score":7,"show_tell_assessment":"2 sentences on show vs tell balance","overused_phrases":["phrase1","phrase2","phrase3"],"dialogue_assessment":"2 sentences","character_voice_diversity":"do characters sound distinct? 2 sentences","genre_comparison":"how does pacing/dialogue/tension compare to '+body.genre+' bestsellers","overall_grade":"B+","top_strengths":["strength1","strength2","strength3"],"top_improvements":["improvement1","improvement2","improvement3"],"manuscript_readiness":"estimated % ready"}\nSYNOPSIS:\n'+synopsis+'\nSAMPLE:\n'+sample}],2500,'Expert '+body.genre+' developmental editor and manuscript analyst.')
    return j({raw})
  }

  if(action==='chapter_hooks'){
    const chaps=body.chapters as{number:number;title:string;ending:string}[]
    const endings=chaps.map(c=>'Ch '+c.number+': '+c.ending).join('\n')
    const raw=await ai([{role:'user',content:'Score each chapter ending for hook strength.\nReturn ONLY valid JSON array:\n[{"chapter":1,"hook_score":8,"hook_type":"cliffhanger|question|revelation|action|emotional|none","ending_summary":"what happens","improvement":"1-sentence tip to strengthen"}]\nCHAPTER ENDINGS:\n'+endings}],1500)
    return j({raw})
  }

  if(action==='brainstorm'){
    const type=body.brainstorm_type as string
    const prompts:Record<string,string>={
      plot_twists:'Generate 8 unexpected plot twists for "'+body.title+'" ('+body.genre+'). Make each genuinely surprising. Return ONLY numbered list, 1 per line.',
      character_names:'Generate 12 compelling character names for a '+body.genre+' novel. Mix of first+last names. Return ONLY numbered list.',
      scene_ideas:'Generate 8 specific scene ideas for "'+body.title+'" that would create memorable moments. Return ONLY numbered list.',
      what_next:'Based on this chapter summary, generate 6 compelling directions the story could go next. Make each distinctly different. Return ONLY numbered list.\nCHAPTER SUMMARY: '+body.context,
      chapter_titles:'Generate 10 compelling chapter titles for a '+body.genre+' novel. Evocative and specific. Return ONLY numbered list.',
      conflict_escalations:'Generate 8 ways to escalate conflict/tension from current story state. Return ONLY numbered list.\nCONTEXT: '+body.context,
    }
    if(!prompts[type])return j({error:'Unknown brainstorm type: '+type},400)
    const text=await ai([{role:'user',content:prompts[type]}],1000)
    return j({text})
  }

  if(action==='scene_generate'){
    const prose=await ai([{role:'user',content:'Generate a complete vivid scene based on this brief.\nCharacters: '+body.characters+'\nLocation: '+body.location+'\nMood/Tone: '+body.mood+'\nEvent/Conflict: '+body.conflict+'\nTarget length: '+(body.length||'500-800')+' words\nOutput ONLY the scene prose.'}],4000,'World-class '+(body.genre as string)+' fiction writer.')
    return j({text:prose})
  }

  if(action==='kdp_categories'){
    const raw=await ai([{role:'user',content:'Amazon KDP category specialist. Recommend 3 specific profitable KDP subcategory paths for:\nTitle: "'+body.title+'" | Genre: '+body.genre+' | Description: '+body.blurb+'\nFocus on SPECIFIC subcategories where competition is lower.\nReturn ONLY valid JSON:\n[{"category_path":"Kindle Store > Kindle eBooks > Genre > Subgenre","competition":"low|medium|high","discoverability":"high|medium|low","reasoning":"1-2 sentences","bestseller_rank_to_hit_100":"e.g. ~500 copies/month"}]'}],800)
    return j({raw})
  }

  if(action==='tool'){
    const t=body.tool as string
    const ps:Record<string,string>={
      prologue:'Write PROLOGUE for "'+body.title+'" by '+body.author+' ('+body.genre+'). Hook reader, 400-600w. Plain prose.\n'+body.synopsis,
      epilogue:'Write EPILOGUE. Closure, 300-500w. Plain prose.\n'+body.extra,
      aplus:'Amazon A+ for "'+body.title+'" ('+body.genre+'): 1)Editorial 150w 2)From Author 100w 3)About Author 80w\n'+body.synopsis,
      sensitivity:'Sensitivity reader. Return ONLY JSON or []: [{"chapter":1,"passage":"","concern":"","severity":"low|medium|high","suggestion":""}]\n'+body.synopsis,
      audiobook:'Audiobook script formatter. Add [PAUSE][SLOW][FAST][BREATH][VOICE:Name].\n'+body.extra,
      gumroad:'Complete Gumroad listing. HEADLINE·SUBHEADLINE·DESCRIPTION(200w)·WHO·WHAT·PRICE\n'+body.synopsis,
      bookclub:'Book club guide. 1.ABOUT 2.THEMES 3.QUESTIONS(10) 4.CHARACTERS 5.AUTHOR NOTE 6.READING LIST\n'+body.synopsis,
      serial:'Split into 3-5 serial episodes. Return ONLY JSON:\n[{"part":1,"title":"","chapters":[1],"endHook":"","teaser":""}]\n'+body.extra,
    }
    if(!ps[t])return j({error:'Unknown tool: '+t},400)
    const text=await ai([{role:'user',content:ps[t]}],3000)
    return j({text})
  }

  // ── draft_save: DB upsert + Google Drive ONLY — no HubSpot deal, no Slack notification ──
  if(action==='draft_save'){
    const title=body.title as string
    const author=body.author as string
    const genre=body.genre as string
    const words=body.word_count as number
    const score=body.avg_score as number
    const cc=body.chapter_count as number
    const html=body.html_content as string
    // 1. Upsert to DB (lightweight — chapters array not sent to keep payload small)
    const{data:book}=await sb.from('book_projects').upsert({
      title,author,genre,word_count:words,chapter_count:cc||0,avg_score:score,
      updated_at:new Date().toISOString()
    },{onConflict:'title'}).select('id').single()
    // 2. Upload HTML to Google Drive C.H.A. LLC Books folder
    let driveUrl=''
    try{if(html)driveUrl=await saveToDrive(title,author,html)}catch(e){console.error('Drive save failed:',String(e))}
    if(book?.id&&driveUrl)await sb.from('book_projects').update({drive_url:driveUrl}).eq('id',book.id)
    return j({success:true,book_id:book?.id||null,drive_url:driveUrl})
  }

  // ── complete: full pipeline — DB + Drive + HubSpot + Slack ──
  if(action==='complete'){
    const{title,author,genre,word_count:wc,avg_score:sc,chapters,bible,marketing,covers,html_content:html}=body as Record<string,unknown>
    const words=wc as number,score=sc as number
    const{data:book}=await sb.from('book_projects').upsert({title,author,genre,word_count:words,chapter_count:(chapters as unknown[])?.length||0,avg_score:score,chapters,bible,marketing,covers,completed_at:new Date().toISOString()},{onConflict:'title'}).select('id').single()
    let driveUrl=''
    try{if(html)driveUrl=await saveToDrive(title as string,author as string,html as string)}catch{}
    if(book?.id&&driveUrl)await sb.from('book_projects').update({drive_url:driveUrl}).eq('id',book.id)
    let dealId:string|null=null
    try{dealId=await hubspotCreate(title as string,author as string,words,score);if(dealId&&book?.id)await sb.from('book_projects').update({hubspot_deal_id:dealId}).eq('id',book.id)}catch{}
    await slackPost('C0AT3NDG5BJ',[
      '\uD83D\uDCDA *Book Complete: "'+title+'"*',
      'Author: '+author+' | Genre: '+genre,
      words.toLocaleString()+' words | Score: '+score+'/10',
      driveUrl?'Drive: '+driveUrl:'',
      dealId?'HubSpot Deal: '+dealId:'HubSpot: no token',
      'DB: '+(book?.id||'?'),
    ].filter(Boolean).join('\n'))
    return j({success:true,book_id:book?.id||null,drive_url:driveUrl,hubspot_deal_id:dealId})
  }

  return j({error:'Unknown action: '+action},400)
  }catch(e){console.error('book-editor:',e);return j({error:String(e)},500)}
})
