export const bound=(x,a,b)=>Math.max(a,Math.min(b,x));
export const keys=['pts','reb','ast','stl','blk','tov','three'];
export function predict(model,x){return model.coefficients.reduce((s,c,i)=>s+c*(x[i]??0),0)}
export function fit(rows,penalty=10){
 const n=rows[0].x.length,A=Array.from({length:n},()=>Array(n+1).fill(0));
 for(const {x,y} of rows)for(let i=0;i<n;i++){for(let j=0;j<n;j++)A[i][j]+=x[i]*x[j];A[i][n]+=x[i]*y;}
 for(let i=1;i<n;i++)A[i][i]+=penalty;
 for(let i=0;i<n;i++){let pivot=i;for(let k=i+1;k<n;k++)if(Math.abs(A[k][i])>Math.abs(A[pivot][i]))pivot=k;[A[i],A[pivot]]=[A[pivot],A[i]];const div=A[i][i]||1e-9;for(let j=i;j<=n;j++)A[i][j]/=div;for(let k=0;k<n;k++)if(k!==i){const v=A[k][i];for(let j=i;j<=n;j++)A[k][j]-=v*A[i][j];}}
 return {coefficients:A.map(row=>row[n])};
}
export const roleFeatures=(last,prior,age)=>[1,last.min/36,(prior?.min??last.min)/36,last.gp/82,(age-27)/10];
export const gamesFeatures=(last,prior,age)=>[1,last.gp/82,(prior?.gp??last.gp)/82,(age-27)/10,((age-27)/10)**2];
export function rateFeatures(last,prior,age,key,mean,shrink){
 const rate=h=>{const exposure=h.min*h.gp;return ((h[key]??0)*h.gp+mean*shrink)/(exposure+shrink)};
 const a=rate(last),b=prior?rate(prior):a;
 return [1,a,b,(age-27)/10,a*(age-27)/10];
}
export const teamFeatures=(t,prior)=>[1,(82*t.wins/(t.wins+t.losses)-41)/20,t.margin/10,(prior?.margin??t.margin)/10];
export function metrics(rows,fn,base){
 const errors=rows.map(r=>fn(r)-r.y),baseline=rows.map(r=>base(r)-r.y);
 const mae=a=>a.reduce((s,x)=>s+Math.abs(x),0)/a.length;
 const rmse=a=>Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length);
 const sorted=errors.map(Math.abs).sort((a,b)=>a-b);
 return {n:rows.length,mae:mae(errors),baselineMae:mae(baseline),rmse:rmse(errors),baselineRmse:rmse(baseline),radius80:sorted[Math.floor(.8*(sorted.length-1))]};
}
