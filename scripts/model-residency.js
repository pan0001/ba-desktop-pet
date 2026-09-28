// Retain short hides for instant recovery; release expensive models only after
// sustained suspension. A visible paused character must keep its frozen frame.
export function createModelResidency({sleep,wake,delay=30000,setTimer=setTimeout,clearTimer=clearTimeout}) {
  let timer=null,hidden=false,sleeping=false,disposed=false;
  return {
    get sleeping(){return sleeping;},
    setHidden(value){
      if(disposed)return;
      hidden=Boolean(value);
      if(hidden){
        if(timer===null&&!sleeping)timer=setTimer(()=>{timer=null;if(disposed||!hidden)return;sleeping=true;sleep();},delay);
      }else{
        if(timer!==null)clearTimer(timer);timer=null;
        if(sleeping){sleeping=false;wake();}
      }
    },
    dispose(){disposed=true;if(timer!==null)clearTimer(timer);timer=null;}
  };
}
