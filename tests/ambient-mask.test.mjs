import test from 'node:test';import assert from 'node:assert/strict';
import {ambientScreenMask} from '../src/lib/ambientMask.mjs';
const svg=value=>decodeURIComponent(value.slice(value.indexOf(',')+1,-2));
test('viewport lighting excludes exactly the normal or portrait player rectangle',()=>{
 const landscape=svg(ambientScreenMask({left:80,top:100,right:880,bottom:550},1200,800));
 assert.match(landscape,/fill-rule="evenodd"/);assert.match(landscape,/M0 0H1200V800H0ZM80 100H880V550H80Z/);
 const portrait=svg(ambientScreenMask({left:20,top:40,right:370,bottom:660},390,844));
 assert.match(portrait,/M20 40H370V660H20Z/);
});
test('scroll and viewport changes clamp the player hole and exclude no invisible area',()=>{
 const scrolled=svg(ambientScreenMask({left:-40,top:-180,right:300,bottom:200},390,844));
 assert.match(scrolled,/M0 0H300V200H0Z/);
 const outside=svg(ambientScreenMask({left:40,top:-500,right:300,bottom:-10},390,844));assert.match(outside,/d="M0 0H390V844H0Z"/);
 assert.equal(ambientScreenMask(null,390,844),'');
});
