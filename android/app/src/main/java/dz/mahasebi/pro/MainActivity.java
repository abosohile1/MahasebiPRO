package dz.mahasebi.pro;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.os.Build;
import android.view.View;
import android.widget.*;
import android.graphics.Color;
import dz.mahasebi.pro.server.ServerService;

public class MainActivity extends Activity {
  LinearLayout root; TextView status; Button toggle;
  @Override public void onCreate(Bundle b){super.onCreate(b); build();}
  void build(){
    root=new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setPadding(32,32,32,32);
    TextView title=new TextView(this); title.setText("محاسبي PRO\nوضع الخادم الرئيسي"); title.setTextSize(26); title.setTextColor(Color.BLACK); root.addView(title);
    status=new TextView(this); status.setText("الخادم متوقف"); status.setTextSize(18); root.addView(status);
    toggle=new Button(this); toggle.setText("تشغيل الخادم"); toggle.setOnClickListener(v->toggleServer()); root.addView(toggle);
    TextView info=new TextView(this); info.setText("\nعند تشغيل الخادم يبقى نشطًا في الخلفية كخدمة Android.\n\nالاتصال عن بعد: استخدم شبكة خاصة مثل Tailscale، ثم ضع عنوان الهاتف في خانة عنوان الخادم داخل العميل.\n\nالمنفذ الافتراضي: 8787"); root.addView(info);
    setContentView(root);
  }
  void toggleServer(){
    Intent i=new Intent(this,ServerService.class); i.setAction(ServerService.ACTION_TOGGLE);
    if(Build.VERSION.SDK_INT>=26) startForegroundService(i); else startService(i);
    status.setText("الخادم يعمل — المنفذ 8787"); toggle.setText("الخادم يعمل");
  }
}
