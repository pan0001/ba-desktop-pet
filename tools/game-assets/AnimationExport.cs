using System;
using System.Reflection;
using System.Collections;
using System.Text.RegularExpressions;
// AssetStudioMod 0.19.0's Animator CLI mode omits AnimationClip from its
// parsed asset types, so --fbx-animation all otherwise produces zero clips.
// Use its unchanged parser/exporter, adding that missing asset type explicitly.
class AnimationExport {
 static object Read(object item,string name) {
  var t=item.GetType();var p=t.GetProperty(name);
  return p!=null?p.GetValue(item,null):t.GetField(name).GetValue(item);
 }
 static void Main(string[] args) {
  var asm=Assembly.LoadFrom(System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"AssetStudioModCLI.exe"));
  var options=asm.GetType("AssetStudioCLI.Options.CLIOptions");
  options.GetMethod("ParseArgs",BindingFlags.Public|BindingFlags.Static).Invoke(null,new object[]{args});
  if (!(bool)options.GetField("isParsed").GetValue(null)) throw new Exception("Invalid export arguments");
  var option=options.GetField("o_exportAssetTypes").GetValue(null);
  var list=(IList)option.GetType().GetProperty("Value").GetValue(option,null);
  var types=Assembly.LoadFrom(System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"AssetStudio.dll")).GetType("AssetStudio.ClassIDType");
  list.Add(Enum.Parse(types,"AnimationClip"));
  var mode=Read(options.GetField("o_workMode").GetValue(null),"Value").ToString();
  if(mode=="SplitObjects")list.Add(Enum.Parse(types,"GameObject"));
  var studio=asm.GetType("AssetStudioCLI.Studio");
  if (!(bool)studio.GetMethod("LoadAssets").Invoke(null,null)) throw new Exception("Unable to load bundles");
  studio.GetMethod("ParseAssets").Invoke(null,null);
  if (Environment.GetEnvironmentVariable("BA_EXPORT_CHARACTER")=="1") {
   var assets=(IList)studio.GetField("parsedAssetsList").GetValue(null);
   for(int i=assets.Count-1;i>=0;i--) {
    var item=assets[i];var t=item.GetType();
    var type=Read(item,"Type").ToString();
    var name=Read(item,"Text").ToString();
    if(type=="AnimationClip"&&!Regex.IsMatch(name,@"_(Cafe|Coffee|Formation)_|_Vital_Death$|_Victory_(Start|End)$",RegexOptions.IgnoreCase)) assets.RemoveAt(i);
   }
  }
  if(mode=="SplitObjects" && !String.IsNullOrEmpty(Environment.GetEnvironmentVariable("BA_EXPORT_PREFAB"))) {
   var assets=(IList)studio.GetField("parsedAssetsList").GetValue(null);
   var animations=(IList)Activator.CreateInstance(assets.GetType());object gameObject=null;
   foreach(var item in assets) {
    var type=Read(item,"Type").ToString();
    if(type=="AnimationClip")animations.Add(item);
    if(type=="GameObject" && Read(item,"Text").ToString()==Environment.GetEnvironmentVariable("BA_EXPORT_PREFAB")) {
     var requestedId=Environment.GetEnvironmentVariable("BA_EXPORT_PREFAB_ID");
     if(!String.IsNullOrEmpty(requestedId) && Read(Read(item,"Asset"),"m_PathID").ToString()!=requestedId)continue;
     if(gameObject!=null)throw new Exception("Ambiguous prefab root");
     gameObject=Read(item,"Asset");
    }
   }
   if(gameObject==null)throw new Exception("Prefab root not found");
   var destination=Read(options.GetField("o_outputFolder").GetValue(null),"Value");
   asm.GetType("AssetStudioCLI.Exporter").GetMethod("ExportGameObject").Invoke(null,new object[]{gameObject,destination,animations});
  } else studio.GetMethod(mode=="SplitObjects"?"ExportSplitObjects":"ExportAnimator").Invoke(null,null);
  studio.GetMethod("Clear").Invoke(null,null);
 }
}
