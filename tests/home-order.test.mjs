import test from 'node:test';import assert from 'node:assert/strict';import {spreadHome}from'../src/lib/homeOrder.mjs';
test('home retains every candidate and spaces channels and mixes across a page boundary',()=>{
 const input=Array.from({length:12},(_,i)=>({videoId:String(i),authorId:'channel'+i%4,...(i<3?{playlistId:'RD'+i,type:'mix'}:{})}));const previous=[{authorId:'channel0',type:'mix'}];const result=spreadHome(input,previous,()=>0.5);assert.deepEqual(result.map(v=>v.videoId).sort(),input.map(v=>v.videoId).sort());assert.notEqual(result[0].authorId,'channel0');assert.notEqual(result[0].type,'mix');for(let i=1;i<result.length;i++)assert.notEqual(result[i].authorId,result[i-1].authorId);assert.equal(input[0].videoId,'0');
});
test('a single available channel never drops videos',()=>{const input=Array.from({length:5},(_,i)=>({videoId:String(i),author:'same'}));assert.equal(spreadHome(input).length,5);});
